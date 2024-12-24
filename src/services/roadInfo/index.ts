import { RoadInfoAPIService } from './types';
import { NominatimRoadInfoService } from './NominatimRoadInfoService';
import { MapboxRoadInfoService } from './MapboxRoadInfoService';
import { OverpassRoadInfoService } from './overpass/OverpassRoadInfoService';

class RoadInfoService {
  private static instance: RoadInfoService;
  private currentService: RoadInfoAPIService;
  private mapboxToken?: string;

  private constructor() {
    // Par défaut on utilise le service Nominatim
    this.currentService = new NominatimRoadInfoService();
  }

  public static getInstance(): RoadInfoService {
    if (!RoadInfoService.instance) {
      RoadInfoService.instance = new RoadInfoService();
    }
    return RoadInfoService.instance;
  }

  public setMapboxToken(token: string) {
    this.mapboxToken = token;
    if (token) {
      this.currentService = new MapboxRoadInfoService(token);
    } else {
      this.currentService = new NominatimRoadInfoService();
    }
  }

  public useNominatim() {
    this.currentService = new NominatimRoadInfoService();
  }

  public useOverpass() {
    this.currentService = new OverpassRoadInfoService();
  }

  public async getCurrentRoadSegment(lat: number, lon: number): Promise<[number, number][]> {
    return this.currentService.getCurrentRoadSegment(lat, lon);
  }

  public async getRoadData(lat: number, lon: number): Promise<any> {
    return this.currentService.getRoadData(lat, lon);
  }
}

export const roadInfoService = RoadInfoService.getInstance();