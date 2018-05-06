import {QualityAction} from '../quality-action';
import {Simulation} from '../../../simulation/simulation';

export class AdvancedTouch extends QualityAction {

    canBeUsed(simulationState: Simulation): boolean {
        return true;
    }

    getBaseCPCost(simulationState: Simulation): number {
        return 48;
    }

    getBaseDurabilityCost(simulationState: Simulation): number {
        return 10;
    }

    getBaseSuccessRate(simulationState: Simulation): number {
        return 90;
    }

    getIds(): number[] {
        return [100008, 100022, 100038, 100052, 100068, 100081, 100097, 100112];
    }

    getPotency(simulation: Simulation): number {
        return 150;
    }

}
