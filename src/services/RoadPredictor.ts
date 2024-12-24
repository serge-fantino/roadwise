import { settingsService, Settings } from './SettingsService';
import { TurnPrediction, RoadPrediction, PredictionObserver } from './prediction/PredictionTypes';
import { RouteTracker } from './RouteTracker';
import { TurnPredictionManager } from './prediction/TurnPredictionManager';
import { DecelerationCalculator } from './prediction/DecelerationCalculator';
import { roadInfoManager } from './roadInfo/RoadInfoManager';

class RoadPredictor {
  private observers: PredictionObserver[] = [];
  private currentPrediction: RoadPrediction | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private routeTracker: RouteTracker;
  private turnPredictionManager: TurnPredictionManager;
  private decelerationCalculator: DecelerationCalculator;
  private destination: [number, number] | null = null;
  private lastRecalculationTime: number = 0;
  private static RECALCULATION_COOLDOWN = 5000; // 5 secondes minimum entre les recalculs

  constructor() {
    this.routeTracker = new RouteTracker();
    this.turnPredictionManager = new TurnPredictionManager();
    this.decelerationCalculator = new DecelerationCalculator();

    roadInfoManager.addObserver((roadInfo) => {
      if (this.currentPrediction) {
        this.currentPrediction.speedLimit = roadInfo.speedLimit;
      }
    });
  }

  public addObserver(observer: PredictionObserver) {
    this.observers.push(observer);
  }

  public removeObserver(observer: PredictionObserver) {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  private notifyObservers() {
    this.observers.forEach(observer => observer(this.currentPrediction, this.turnPredictionManager.getTurns()));
  }

  private async updatePrediction(routePoints: [number, number][]) {
    const vehicle = (window as any).globalVehicle;
    if (!vehicle || !routePoints || routePoints.length < 2) {
      this.currentPrediction = null;
      this.notifyObservers();
      return;
    }

    const currentPosition = vehicle.position;
    const currentSpeed = vehicle.speed * 3.6;
    const settings = settingsService.getSettings();

    const roadInfo = roadInfoManager.getCurrentInfo();
    const speedLimit = roadInfo?.speedLimit ?? null;
    const isOnRoad = roadInfo?.isOnRoad ?? false;

    const { index: closestPointIndex, distance: deviationDistance } = 
      this.routeTracker.findClosestPointOnRoute(currentPosition, routePoints);

    // Vérifier si le véhicule est trop loin de la route
    if (this.routeTracker.isOffRoute(deviationDistance, settings) && 
        this.destination && 
        isOnRoad && // Ne recalculer que si on est sur une route
        currentSpeed > 0 && // Ne pas recalculer si le véhicule est à l'arrêt
        Date.now() - this.lastRecalculationTime > RoadPredictor.RECALCULATION_COOLDOWN) { // Respecter le cooldown
      
      console.log('Vehicle is off route, recalculating...', {
        currentPosition,
        destination: this.destination,
        deviationDistance,
        isOnRoad,
        currentSpeed
      });
      
      // Déclencher l'événement de recalcul d'itinéraire
      const event = new CustomEvent('recalculateRoute', {
        detail: {
          from: currentPosition,
          to: this.destination
        }
      });
      window.dispatchEvent(event);
      this.lastRecalculationTime = Date.now();
      return;
    }

    await roadInfoManager.updateRoadInfo(currentPosition);
    await this.turnPredictionManager.updateTurnDistances(currentPosition);
    this.turnPredictionManager.removePastTurns();

    const turns = this.turnPredictionManager.getTurns();
    const lastTurnIndex = turns.length > 0 
      ? Math.max(...turns.map(t => t.index))
      : closestPointIndex;

    await this.turnPredictionManager.findNewTurns(
      routePoints,
      lastTurnIndex,
      currentPosition,
      settings,
      speedLimit
    );

    this.turnPredictionManager.sortTurns();

    // Important: On réinitialise toujours la prédiction actuelle
    this.currentPrediction = null;

    const nextTurn = this.turnPredictionManager.getNextTurn();
    
    if (nextTurn) {
      const requiredDeceleration = currentSpeed > (nextTurn.optimalSpeed || 0)
        ? this.decelerationCalculator.calculateRequiredDeceleration(
            currentSpeed,
            nextTurn.optimalSpeed || 0,
            nextTurn.distance
          )
        : null;

      this.currentPrediction = {
        ...nextTurn,
        requiredDeceleration
      };
    }

    console.log('Road prediction updated:', { 
      currentPrediction: this.currentPrediction,
      allTurns: this.turnPredictionManager.getTurns(),
      speedLimit
    });
    
    this.notifyObservers();
  }

  public startUpdates(routePoints: [number, number][], destination?: [number, number]) {
    // Reset the turns when starting updates with new route points
    this.turnPredictionManager = new TurnPredictionManager();
    this.currentPrediction = null;
    this.lastRecalculationTime = 0;
    
    // Mettre à jour la destination si elle est fournie
    if (destination) {
      this.destination = destination;
    }
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updatePrediction(routePoints);
    }, 1000);

    // Initial update
    this.updatePrediction(routePoints);
  }

  public stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.currentPrediction = null;
    this.destination = null;
    this.notifyObservers();
  }
}

export const roadPredictor = new RoadPredictor();