import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PredictionOverlay from './PredictionOverlay';
import L from 'leaflet';
import { isPointOnRoad } from '../utils/osmUtils';
import { getRoute } from '../utils/routingUtils';
import { toast } from '../components/ui/use-toast';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom vehicle icon
const vehicleIcon = L.divIcon({
  html: '🚗',
  className: 'vehicle-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Custom destination icon
const destinationIcon = L.divIcon({
  html: '📍',
  className: 'destination-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

// Component to handle map center updates and zoom to destination
const MapUpdater = ({ 
  position, 
  onRoadStatusChange,
  destination 
}: { 
  position: [number, number], 
  onRoadStatusChange: (status: boolean) => void,
  destination?: [number, number]
}) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(position, map.getZoom());

    // Check if point is on road
    const checkRoadPosition = async () => {
      const [lat, lon] = position;
      const onRoad = await isPointOnRoad(lat, lon);
      onRoadStatusChange(onRoad);
      
      if (!onRoad) {
        toast({
          title: "Attention",
          description: "Le véhicule ne semble pas être sur une route",
          variant: "destructive"
        });
      }
    };

    checkRoadPosition();
  }, [position, map, onRoadStatusChange]);

  useEffect(() => {
    const handleZoomToDestination = (e: CustomEvent) => {
      const { location } = e.detail;
      map.setView(location, 15);
    };

    const mapElement = map.getContainer();
    mapElement.addEventListener('zoomToDestination', handleZoomToDestination as EventListener);

    return () => {
      mapElement.removeEventListener('zoomToDestination', handleZoomToDestination as EventListener);
    };
  }, [map]);
  
  return null;
};

const MapClickHandler = ({ onMapClick }: { onMapClick: (e: L.LeafletMouseEvent) => void }) => {
  useMapEvents({
    click: onMapClick,
  });
  return null;
};

interface MapViewProps {
  position: [number, number];
  speed: number;
  onRoadStatusChange: (status: boolean) => void;
  destination?: [number, number];
}

const MapView = ({ position, speed, onRoadStatusChange, destination }: MapViewProps) => {
  const [isOnRoad, setIsOnRoad] = useState(true);
  const [positionHistory, setPositionHistory] = useState<[number, number][]>([]);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);

  const handleRoadStatusChange = (status: boolean) => {
    setIsOnRoad(status);
    onRoadStatusChange(status);
  };

  // Update position history
  useEffect(() => {
    if (speed > 0) {
      setPositionHistory(prev => {
        const newHistory = [...prev, position];
        return newHistory.slice(-10);
      });
    }
  }, [position, speed]);

  // Handle map click to set destination
  const handleMapClick = async (e: L.LeafletMouseEvent) => {
    const newDestination: [number, number] = [e.latlng.lat, e.latlng.lng];

    try {
      const route = await getRoute(position, newDestination);
      setRoutePoints(route);
      toast({
        title: "Itinéraire calculé",
        description: "L'itinéraire a été calculé avec succès",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de calculer l'itinéraire",
        variant: "destructive"
      });
    }
  };

  return (
    <MapContainer
      center={position}
      zoom={17}
      className="w-full h-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="map-tiles"
      />
      <MapUpdater 
        position={position} 
        onRoadStatusChange={handleRoadStatusChange}
        destination={destination}
      />
      <MapClickHandler onMapClick={handleMapClick} />
      <PredictionOverlay position={position} speed={speed} />
      <Marker 
        position={position} 
        icon={isOnRoad ? vehicleIcon : new L.Icon.Default()}
      />
      {speed > 0 && positionHistory.length > 1 && (
        <Polyline
          positions={positionHistory}
          color="#3B82F6"
          weight={3}
          opacity={0.7}
        />
      )}
      {destination && (
        <Marker 
          position={destination}
          icon={destinationIcon}
        />
      )}
      {routePoints.length > 0 && (
        <Polyline
          positions={routePoints}
          color="#10B981"
          weight={4}
          opacity={0.8}
          dashArray="10, 10"
        />
      )}
    </MapContainer>
  );
};

export default MapView;
