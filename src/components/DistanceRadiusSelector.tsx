import React from 'react';
import { MapPin } from 'lucide-react';

interface DistanceRadiusSelectorProps {
  value: number;
  onChange: (radius: number) => void;
  className?: string;
  disabled?: boolean;
}

const RADIUS_OPTIONS = [
  { value: 5, label: '5 miles' },
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100+ miles' },
];

export const DistanceRadiusSelector: React.FC<DistanceRadiusSelectorProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
}) => {
  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center">
        <MapPin className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
        <label htmlFor="distance-radius" className="text-sm font-medium text-gray-700 mr-3">
          Within:
        </label>
        <select
          id="distance-radius"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          {RADIUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};