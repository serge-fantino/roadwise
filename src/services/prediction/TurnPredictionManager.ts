import { TurnPrediction } from './PredictionTypes';
import { SpeedLimitCache } from '../SpeedLimitCache';
import { Settings } from '../SettingsService';
import { calculateDistance } from '../../utils/mapUtils';
import { CurveDetector } from './CurveAnalyzer';
import { CurveAssistanceCalculator } from './CurveAssistant';
import { EnhancedRoutePoint } from '../route/RoutePlannerTypes';

export class TurnPredictionManager {
  private turns: TurnPrediction[] = [];
  private speedLimitCache: SpeedLimitCache;
  private curveDetector: CurveDetector;
  private curveAssistant: CurveAssistanceCalculator;

  constructor() {
    this.speedLimitCache = new SpeedLimitCache();
    this.curveDetector = new CurveDetector();
    this.curveAssistant = new CurveAssistanceCalculator();
  }

  updateTurnDistances(
    currentPosition: [number, number], 
    currentIndex: number,
    routePoints: [number, number][]
  ): void {
    for (let turn of this.turns) {
        turn.distance = this.calculateRoadDistanceToIndex(
            currentPosition, 
            currentIndex, 
            turn.curveInfo.startIndex, 
            routePoints
        );
    }
  }

  calculateRoadDistanceToIndex(
    currentPosition: [number, number], 
    startIndex: number, 
    endIndex: number,
    routePoints: [number, number][]
  ): number {
    let distance = calculateDistance(currentPosition, routePoints[startIndex]);
    for (let i = startIndex+1; i <= endIndex; i++) {
      distance += calculateDistance(routePoints[i-1], routePoints[i]);
    }
    return distance;
  }

  removePastTurns(currentIndex: number): void {
    this.turns = this.turns.filter(turn => turn.curveInfo.endIndex >= currentIndex);
  }

  async findNewTurns(
    enhancedPoints: EnhancedRoutePoint[],
    startIndex: number,
    currentPosition: [number, number],
    settings: Settings,
    currentSpeed: number,
    currentSpeedLimit: number | null = null
  ): Promise<void> {

    let nextIndex = startIndex;
    let distance = calculateDistance(currentPosition, enhancedPoints[nextIndex].position);
    console.log('[TurnPredictionManager] Start detecting curves from index at distance:', nextIndex, distance, settings.predictionDistance);
    while (distance <= settings.predictionDistance && this.turns.length < 10) {
      const curveAnalysis = this.curveDetector.analyzeCurve(
        enhancedPoints,
        nextIndex,
        settings
      );
      
      if (!curveAnalysis) {
        console.log('[TurnPredictionManager] No curve detected after index:', nextIndex);
        return;
      } else {
        //console.log('[TurnPredictionManager] Curve detected:', curveAnalysis);
      }

      for (let i = nextIndex+1; i <= curveAnalysis.startIndex; i++) {
        distance += calculateDistance(enhancedPoints[i-1].position, enhancedPoints[i].position);
      }
    
      const speedLimit = currentSpeedLimit || await this.speedLimitCache.getSpeedLimit(
        curveAnalysis.startPoint[0],
        curveAnalysis.startPoint[1]
      );

      // Calculer les vitesses et points de freinage avec CurveAssistant
      const curveCalculations = this.curveAssistant.calculateAll(
        currentSpeed,
        distance,
        curveAnalysis,
        speedLimit,
        settings.drivingStyle
      );

      // Créer une nouvelle prédiction de virage
      const turnPrediction: TurnPrediction = {
        distance,
        angle: curveAnalysis.apexAngle,
        position: curveAnalysis.startPoint,
        index: curveAnalysis.startIndex,
        speedLimit,
        optimalSpeed: curveCalculations.optimalCurveSpeed,
        requiredDeceleration: distance > curveCalculations.brakingPoint ? null : 
          (curveCalculations.optimalCurveSpeed - currentSpeed) / (distance || 1),
        curveInfo: curveAnalysis
      };
      /*
      console.log('[TurnPredictionManager] New turn prediction:', {
        distance,
        angle: curveAnalysis.apexAngle,
        optimalSpeed: curveCalculations.optimalCurveSpeed,
        brakingPoint: curveCalculations.brakingPoint
      });
      */

      this.turns.push(turnPrediction);

      for (let i = curveAnalysis.startIndex+1; i <= curveAnalysis.endIndex; i++) {
        distance += calculateDistance(enhancedPoints[i-1].position, enhancedPoints[i].position);
      }

      nextIndex = curveAnalysis.endIndex+1;
    }
    console.log('[TurnPredictionManager] End detecting curves:', this.turns.length);
  }

  sortTurns(): void {
    this.turns.sort((a, b) => a.distance - b.distance);
  }

  getTurns(): TurnPrediction[] {
    return this.turns;
  }

  getNextTurn(): TurnPrediction | null {
    return this.turns.length > 0 ? this.turns[0] : null;
  }
}