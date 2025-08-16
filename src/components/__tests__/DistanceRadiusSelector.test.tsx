import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DistanceRadiusSelector } from '../DistanceRadiusSelector';

describe('DistanceRadiusSelector', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('should render with default props', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByLabelText('Within:')).toBeInTheDocument();
    expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
  });

  it('should render all radius options', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
      />
    );

    const select = screen.getByRole('combobox');
    const options = screen.getAllByRole('option');

    expect(options).toHaveLength(5);
    expect(screen.getByRole('option', { name: '5 miles' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '10 miles' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '25 miles' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '50 miles' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '100+ miles' })).toBeInTheDocument();
  });

  it('should call onChange when selection changes', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '50' } });

    expect(mockOnChange).toHaveBeenCalledWith(50);
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
        disabled={true}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('should not be disabled when disabled prop is false', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
        disabled={false}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).not.toBeDisabled();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should display correct value for each radius option', () => {
    const testCases = [
      { value: 5, expectedText: '5 miles' },
      { value: 10, expectedText: '10 miles' },
      { value: 25, expectedText: '25 miles' },
      { value: 50, expectedText: '50 miles' },
      { value: 100, expectedText: '100+ miles' },
    ];

    testCases.forEach(({ value, expectedText }) => {
      const { unmount } = render(
        <DistanceRadiusSelector
          value={value}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByDisplayValue(expectedText)).toBeInTheDocument();
      unmount();
    });
  });

  it('should have proper accessibility attributes', () => {
    render(
      <DistanceRadiusSelector
        value={25}
        onChange={mockOnChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'distance-radius');
    
    const label = screen.getByLabelText('Within:');
    expect(label).toBeInTheDocument();
  });
});