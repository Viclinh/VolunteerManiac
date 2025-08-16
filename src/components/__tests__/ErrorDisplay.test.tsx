import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay } from '../ErrorDisplay';
import { APIError, ServiceStatus } from '../../types/volunteer';

describe('ErrorDisplay', () => {
  const mockErrors: APIError[] = [
    {
      source: 'TestService1',
      type: 'network',
      message: 'Network error',
      userMessage: 'Unable to connect to TestService1',
      retryable: true,
      suggestions: ['Check your internet connection', 'Try again later']
    },
    {
      source: 'TestService2',
      type: 'authentication',
      message: 'Auth failed',
      userMessage: 'Access denied by TestService2',
      retryable: false,
      suggestions: ['Contact support']
    }
  ];

  const mockServiceStatuses: ServiceStatus[] = [
    {
      serviceName: 'TestService1',
      healthy: false,
      responseTime: 5000,
      lastChecked: new Date(),
      error: 'Network timeout',
      consecutiveFailures: 1
    },
    {
      serviceName: 'TestService2',
      healthy: true,
      responseTime: 200,
      lastChecked: new Date(),
      consecutiveFailures: 0
    }
  ];

  it('should not render when there are no errors', () => {
    const { container } = render(<ErrorDisplay errors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render critical error when no results and critical errors exist', () => {
    const criticalErrors: APIError[] = [
      {
        source: 'TestService',
        type: 'authentication',
        message: 'Auth failed',
        userMessage: 'Access denied',
        retryable: false,
        suggestions: ['Contact support']
      }
    ];

    render(
      <ErrorDisplay 
        errors={criticalErrors} 
        totalResults={0} 
        partialResults={false}
      />
    );

    expect(screen.getByText('Search Issues')).toBeInTheDocument();
    expect(screen.getByText('Unable to search volunteer opportunities due to service issues')).toBeInTheDocument();
  });

  it('should render warning for partial results', () => {
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={5} 
        partialResults={true}
      />
    );

    expect(screen.getByText('Partial Results')).toBeInTheDocument();
    expect(screen.getByText('Found 5 opportunities, but 2 sources had issues')).toBeInTheDocument();
  });

  it('should show retry button for retryable errors', () => {
    const mockOnRetry = vi.fn();
    
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={0} 
        onRetry={mockOnRetry}
      />
    );

    const retryButton = screen.getByText('Retry Failed Sources');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('should show retrying state when isRetrying is true', () => {
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={0} 
        onRetry={vi.fn()}
        isRetrying={true}
      />
    );

    expect(screen.getByText('Retrying...')).toBeInTheDocument();
  });

  it('should show error details when expanded', () => {
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={0}
      />
    );

    const showDetailsButton = screen.getByText('Show Details');
    fireEvent.click(showDetailsButton);

    expect(screen.getByText('Error Details:')).toBeInTheDocument();
    expect(screen.getByText('TestService1:')).toBeInTheDocument();
    expect(screen.getByText('TestService2:')).toBeInTheDocument();
    expect(screen.getByText('Unable to connect to TestService1')).toBeInTheDocument();
    expect(screen.getByText('Access denied by TestService2')).toBeInTheDocument();
  });

  it('should show service status when expanded', () => {
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        serviceStatuses={mockServiceStatuses}
        totalResults={0}
      />
    );

    const serviceStatusButton = screen.getByText('Service Status');
    fireEvent.click(serviceStatusButton);

    expect(screen.getByText('Service Status:')).toBeInTheDocument();
    expect(screen.getByText('TestService1')).toBeInTheDocument();
    expect(screen.getByText('TestService2')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('200ms')).toBeInTheDocument();
  });

  it('should display suggestions from errors', () => {
    render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={0}
      />
    );

    expect(screen.getByText('Check your internet connection')).toBeInTheDocument();
    expect(screen.getByText('Try again in a few minutes')).toBeInTheDocument();
  });

  it('should handle single error message correctly', () => {
    const singleError: APIError[] = [
      {
        source: 'TestService',
        type: 'network',
        message: 'Network error',
        userMessage: 'Unable to connect',
        retryable: true,
        suggestions: []
      }
    ];

    render(
      <ErrorDisplay 
        errors={singleError} 
        totalResults={3} 
        partialResults={true}
      />
    );

    expect(screen.getByText('Found 3 opportunities, but TestService was unavailable')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ErrorDisplay 
        errors={mockErrors} 
        totalResults={0}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});