import {DataModel} from '../data-model';
import {DataStore} from '../data-store';
import {Observable} from 'rxjs/Observable';
import {NgSerializerService} from '@kaiu/ng-serializer';
import {NgZone} from '@angular/core';
import {AngularFirestore} from 'angularfire2/firestore';
import * as firebase from 'firebase';
import {Action} from 'angularfire2/firestore/interfaces';
import {Subject} from 'rxjs/Subject';
import {Subscription} from 'rxjs/Subscription';
import {ReplaySubject} from 'rxjs/ReplaySubject';
import {DataResponse} from '../data-response';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/throw';
import 'rxjs/add/operator/do';
import DocumentReference = firebase.firestore.DocumentReference;
import DocumentSnapshot = firebase.firestore.DocumentSnapshot;
import {PendingChangesService} from '../../pending-changes/pending-changes.service';

export abstract class FirestoreStorage<T extends DataModel> extends DataStore<T> {

    protected cache: { [index: string]: { subject: Subject<DataResponse<T>>, subscription: Subscription } } = {};

    constructor(protected firestore: AngularFirestore, protected serializer: NgSerializerService, protected zone: NgZone,
                protected pendingChangesService: PendingChangesService) {
        super();
    }

    add(data: T): Observable<string> {
        this.pendingChangesService.addPendingChange(`add ${this.getBaseUri()}`);
        const toAdd = JSON.parse(JSON.stringify(data));
        delete toAdd.$key;
        return Observable.fromPromise(this.firestore.collection(this.getBaseUri()).add(toAdd))
            .map((ref: DocumentReference) => {
                return ref.id;
            }).do((uid: string) => {
                // In order to enable cache for this newly created element.
                this.get(uid);
                this.pendingChangesService.removePendingChange(`add ${this.getBaseUri()}`);
            });
    }

    get(uid: string): Observable<T> {
        if (this.cache[uid] === undefined) {
            this.cache[uid] = {
                subject: new ReplaySubject<DataResponse<T>>(1),
                subscription: this.firestore.collection(this.getBaseUri()).doc(uid).snapshotChanges()
                    .map((snap: Action<DocumentSnapshot>) => {
                        const valueWithKey: T = <T>{$key: snap.payload.id, ...snap.payload.data()};
                        if (!snap.payload.exists) {
                            throw new Error(`${this.getBaseUri()}/${uid} Not found`);
                        }
                        delete snap.payload;
                        return this.serializer.deserialize<T>(valueWithKey, this.getClass());
                    })
                    .debounceTime(50)
                    .publishReplay(1)
                    .refCount()
                    .subscribe(data => {
                        this.cache[uid].subject.next({data: data})
                    }, err => {
                        this.cache[uid].subject.next({data: undefined, error: err})
                    })
            };
        }
        return this.cache[uid].subject.mergeMap(response => {
            if (response.error === undefined) {
                return Observable.of(response.data);
            } else {
                return Observable.throw(response.error)
            }
        });
    }

    update(uid: string, data: T): Observable<void> {
        this.pendingChangesService.addPendingChange(`update ${this.getBaseUri()}/${uid}`);
        const toUpdate = JSON.parse(JSON.stringify(data));
        delete toUpdate.$key;
        // Optimistic update for better UX with large lists
        if (this.cache[uid] !== undefined) {
            this.cache[uid].subject.next({data: data});
        }
        return this.zone.runOutsideAngular(() => {
            if (uid === undefined || uid === null || uid === '') {
                throw new Error('Empty uid');
            }
            return Observable.fromPromise(this.firestore.collection(this.getBaseUri()).doc(uid).update(toUpdate)).do(() => {
                this.pendingChangesService.removePendingChange(`update ${this.getBaseUri()}/${uid}`);
            });
        });
    }

    set(uid: string, data: T): Observable<void> {
        this.pendingChangesService.addPendingChange(`set ${this.getBaseUri()}/${uid}`);
        const toSet = JSON.parse(JSON.stringify(data));
        delete toSet.$key;
        // Optimistic update for better UX with large lists
        if (this.cache[uid] !== undefined) {
            this.cache[uid].subject.next({data: data});
        }
        return this.zone.runOutsideAngular(() => {
            if (uid === undefined || uid === null || uid === '') {
                throw new Error('Empty uid');
            }
            return Observable.fromPromise(this.firestore.collection(this.getBaseUri()).doc(uid).set(toSet)).do(() => {
                this.pendingChangesService.removePendingChange(`set ${this.getBaseUri()}/${uid}`);
            });
        });
    }

    remove(uid: string): Observable<void> {
        this.pendingChangesService.addPendingChange(`remove ${this.getBaseUri()}/${uid}`);
        if (uid === undefined || uid === null || uid === '') {
            throw new Error('Empty uid');
        }
        return Observable.fromPromise(this.firestore.collection(this.getBaseUri()).doc(uid).delete())
            .do(() => {
                // If there's cache information, delete it.
                if (this.cache[uid] !== undefined) {
                    this.cache[uid].subscription.unsubscribe();
                    this.cache[uid].subject.next(null);
                    delete this.cache[uid];
                }
                this.pendingChangesService.removePendingChange(`remove ${this.getBaseUri()}/${uid}`);
            });
    }

}
