import { VolunteerOpportunity, SearchFilters } from '../types/volunteer';

export type SortOption = 'distance' | 'date' | 'relevance' | 'title' | 'organization';
export type SortDirection = 'asc' | 'desc';

export interface FilterOptions {
  radius?: number; // in miles
  causes?: string[];
  type?: 'in-person' | 'virtual' | 'both';
  timeCommitment?: string[];
  skills?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  verified?: boolean;
  hasContactInfo?: boolean;
  minParticipants?: number;
  maxParticipants?: number;
}

export interface SortOptions {
  primary: SortOption;
  direction: SortDirection;
  secondary?: SortOption;
  secondaryDirection?: SortDirection;
}

export interface FilteringStats {
  originalCount: number;
  filteredCount: number;
  filtersApplied: string[];
  processingTime: number;
}

export class FilteringSortingService {
  /**
   * Apply filters to opportunities
   */
  filterOpportunities(
    opportunities: VolunteerOpportunity[],
    filters: FilterOptions
  ): { opportunities: VolunteerOpportunity[]; stats: FilteringStats } {
    const startTime = Date.now();
    const originalCount = opportunities.length;
    const filtersApplied: string[] = [];

    console.log('[FilteringSortingService] Applying filters', {
      originalCount,
      filters
    });

    let filtered = [...opportunities];

    // Apply distance-based filtering
    if (filters.radius !== undefined && filters.radius > 0) {
      filtered = this.filterByDistance(filtered, filters.radius);
      filtersApplied.push(`radius: ${filters.radius} miles`);
    }

    // Apply cause filtering
    if (filters.causes && filters.causes.length > 0) {
      filtered = this.filterByCauses(filtered, filters.causes);
      filtersApplied.push(`causes: ${filters.causes.join(', ')}`);
    }

    // Apply type filtering
    if (filters.type && filters.type !== 'both') {
      filtered = this.filterByType(filtered, filters.type);
      filtersApplied.push(`type: ${filters.type}`);
    }

    // Apply time commitment filtering
    if (filters.timeCommitment && filters.timeCommitment.length > 0) {
      filtered = this.filterByTimeCommitment(filtered, filters.timeCommitment);
      filtersApplied.push(`timeCommitment: ${filters.timeCommitment.join(', ')}`);
    }

    // Apply skills filtering
    if (filters.skills && filters.skills.length > 0) {
      filtered = this.filterBySkills(filtered, filters.skills);
      filtersApplied.push(`skills: ${filters.skills.join(', ')}`);
    }

    // Apply date range filtering
    if (filters.dateRange) {
      filtered = this.filterByDateRange(filtered, filters.dateRange);
      filtersApplied.push('dateRange');
    }

    // Apply verification filtering
    if (filters.verified !== undefined) {
      filtered = this.filterByVerification(filtered, filters.verified);
      filtersApplied.push(`verified: ${filters.verified}`);
    }

    // Apply contact info filtering
    if (filters.hasContactInfo) {
      filtered = this.filterByContactInfo(filtered);
      filtersApplied.push('hasContactInfo');
    }

    // Apply participant count filtering
    if (filters.minParticipants !== undefined || filters.maxParticipants !== undefined) {
      filtered = this.filterByParticipantCount(filtered, filters.minParticipants, filters.maxParticipants);
      if (filters.minParticipants !== undefined) {
        filtersApplied.push(`minParticipants: ${filters.minParticipants}`);
      }
      if (filters.maxParticipants !== undefined) {
        filtersApplied.push(`maxParticipants: ${filters.maxParticipants}`);
      }
    }

    const processingTime = Date.now() - startTime;
    const stats: FilteringStats = {
      originalCount,
      filteredCount: filtered.length,
      filtersApplied,
      processingTime
    };

    console.log('[FilteringSortingService] Filtering completed', stats);

    return { opportunities: filtered, stats };
  }

  /**
   * Sort opportunities based on specified criteria
   */
  sortOpportunities(
    opportunities: VolunteerOpportunity[],
    sortOptions: SortOptions
  ): VolunteerOpportunity[] {
    console.log('[FilteringSortingService] Sorting opportunities', {
      count: opportunities.length,
      sortOptions
    });

    const sorted = [...opportunities].sort((a, b) => {
      // Primary sort
      const primaryResult = this.compareOpportunities(a, b, sortOptions.primary, sortOptions.direction);
      
      if (primaryResult !== 0) {
        return primaryResult;
      }

      // Secondary sort if primary values are equal
      if (sortOptions.secondary) {
        return this.compareOpportunities(
          a, 
          b, 
          sortOptions.secondary, 
          sortOptions.secondaryDirection || 'asc'
        );
      }

      return 0;
    });

    console.log('[FilteringSortingService] Sorting completed');
    return sorted;
  }

  /**
   * Filter opportunities by distance radius
   */
  private filterByDistance(opportunities: VolunteerOpportunity[], radius: number): VolunteerOpportunity[] {
    return opportunities.filter(opp => {
      // Virtual opportunities are always included
      if (opp.type === 'virtual') {
        return true;
      }
      
      // Include if distance is within radius or distance is unknown
      return opp.distance === undefined || opp.distance <= radius;
    });
  }

  /**
   * Filter opportunities by causes
   */
  private filterByCauses(opportunities: VolunteerOpportunity[], causes: string[]): VolunteerOpportunity[] {
    const lowerCauses = causes.map(cause => cause.toLowerCase());
    
    return opportunities.filter(opp => 
      lowerCauses.includes(opp.cause.toLowerCase())
    );
  }

  /**
   * Filter opportunities by type (in-person or virtual)
   */
  private filterByType(opportunities: VolunteerOpportunity[], type: 'in-person' | 'virtual'): VolunteerOpportunity[] {
    return opportunities.filter(opp => opp.type === type);
  }

  /**
   * Filter opportunities by time commitment
   */
  private filterByTimeCommitment(opportunities: VolunteerOpportunity[], timeCommitments: string[]): VolunteerOpportunity[] {
    return opportunities.filter(opp => {
      const oppTimeCommitment = opp.timeCommitment.toLowerCase();
      
      return timeCommitments.some(commitment => {
        const lowerCommitment = commitment.toLowerCase();
        
        // Check for exact matches or partial matches
        if (oppTimeCommitment.includes(lowerCommitment)) {
          return true;
        }
        
        // Check for time-based patterns
        if (this.matchesTimePattern(oppTimeCommitment, lowerCommitment)) {
          return true;
        }
        
        return false;
      });
    });
  }

  /**
   * Check if time commitment matches a pattern
   */
  private matchesTimePattern(oppTime: string, filterTime: string): boolean {
    // Define time commitment categories
    const timeCategories: { [key: string]: string[] } = {
      'short': ['1 hour', '2 hours', '3 hours', 'few hours', 'morning', 'afternoon'],
      'medium': ['4 hours', '5 hours', '6 hours', 'half day', 'day'],
      'long': ['full day', 'weekend', 'week', 'multiple days'],
      'ongoing': ['weekly', 'monthly', 'ongoing', 'regular', 'recurring']
    };

    // Check if the filter matches any category that the opportunity falls into
    for (const [category, patterns] of Object.entries(timeCategories)) {
      if (filterTime.includes(category)) {
        return patterns.some(pattern => oppTime.includes(pattern));
      }
    }

    return false;
  }

  /**
   * Filter opportunities by required skills
   */
  private filterBySkills(opportunities: VolunteerOpportunity[], skills: string[]): VolunteerOpportunity[] {
    const lowerSkills = skills.map(skill => skill.toLowerCase());
    
    return opportunities.filter(opp => {
      const oppSkills = opp.skills.map(skill => skill.toLowerCase());
      
      // Check if opportunity has any of the required skills
      return lowerSkills.some(skill => 
        oppSkills.some(oppSkill => 
          oppSkill.includes(skill) || skill.includes(oppSkill)
        )
      );
    });
  }

  /**
   * Filter opportunities by date range
   */
  private filterByDateRange(
    opportunities: VolunteerOpportunity[], 
    dateRange: { start?: Date; end?: Date }
  ): VolunteerOpportunity[] {
    return opportunities.filter(opp => {
      const oppDate = new Date(opp.date);
      
      if (dateRange.start && oppDate < dateRange.start) {
        return false;
      }
      
      if (dateRange.end && oppDate > dateRange.end) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Filter opportunities by verification status
   */
  private filterByVerification(opportunities: VolunteerOpportunity[], verified: boolean): VolunteerOpportunity[] {
    return opportunities.filter(opp => opp.verified === verified);
  }

  /**
   * Filter opportunities that have contact information
   */
  private filterByContactInfo(opportunities: VolunteerOpportunity[]): VolunteerOpportunity[] {
    return opportunities.filter(opp => 
      opp.contactInfo.email || 
      opp.contactInfo.phone || 
      opp.contactInfo.website
    );
  }

  /**
   * Filter opportunities by participant count range
   */
  private filterByParticipantCount(
    opportunities: VolunteerOpportunity[], 
    minParticipants?: number, 
    maxParticipants?: number
  ): VolunteerOpportunity[] {
    return opportunities.filter(opp => {
      if (!opp.participants) {
        return true; // Include opportunities without participant info
      }
      
      if (minParticipants !== undefined && opp.participants < minParticipants) {
        return false;
      }
      
      if (maxParticipants !== undefined && opp.participants > maxParticipants) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Compare two opportunities for sorting
   */
  private compareOpportunities(
    a: VolunteerOpportunity, 
    b: VolunteerOpportunity, 
    sortBy: SortOption, 
    direction: SortDirection
  ): number {
    let result = 0;

    switch (sortBy) {
      case 'distance':
        result = this.compareDistance(a, b);
        break;
      case 'date':
        result = this.compareDate(a, b);
        break;
      case 'relevance':
        result = this.compareRelevance(a, b);
        break;
      case 'title':
        result = a.title.localeCompare(b.title);
        break;
      case 'organization':
        result = a.organization.localeCompare(b.organization);
        break;
      default:
        result = 0;
    }

    return direction === 'desc' ? -result : result;
  }

  /**
   * Compare opportunities by distance
   */
  private compareDistance(a: VolunteerOpportunity, b: VolunteerOpportunity): number {
    // Virtual opportunities come first
    if (a.type === 'virtual' && b.type !== 'virtual') return -1;
    if (b.type === 'virtual' && a.type !== 'virtual') return 1;
    
    // Both virtual - sort by title
    if (a.type === 'virtual' && b.type === 'virtual') {
      return a.title.localeCompare(b.title);
    }
    
    // Compare distances
    const distanceA = a.distance ?? Infinity;
    const distanceB = b.distance ?? Infinity;
    
    return distanceA - distanceB;
  }

  /**
   * Compare opportunities by date
   */
  private compareDate(a: VolunteerOpportunity, b: VolunteerOpportunity): number {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    
    return dateA.getTime() - dateB.getTime();
  }

  /**
   * Compare opportunities by relevance (custom scoring)
   */
  private compareRelevance(a: VolunteerOpportunity, b: VolunteerOpportunity): number {
    const scoreA = this.calculateRelevanceScore(a);
    const scoreB = this.calculateRelevanceScore(b);
    
    return scoreB - scoreA; // Higher score first
  }

  /**
   * Calculate relevance score for an opportunity
   */
  private calculateRelevanceScore(opportunity: VolunteerOpportunity): number {
    let score = 0;
    
    // Verified opportunities get higher score
    if (opportunity.verified) score += 10;
    
    // Complete contact info increases score
    if (opportunity.contactInfo.email) score += 3;
    if (opportunity.contactInfo.phone) score += 2;
    if (opportunity.contactInfo.website) score += 1;
    
    // Recent opportunities get higher score
    const daysSinceUpdate = (Date.now() - opportunity.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) score += 5;
    else if (daysSinceUpdate < 30) score += 3;
    else if (daysSinceUpdate < 90) score += 1;
    
    // Detailed description increases score
    if (opportunity.description.length > 100) score += 2;
    if (opportunity.description.length > 200) score += 1;
    
    // Skills specified increases score
    score += Math.min(opportunity.skills.length, 3);
    
    // Image available increases score
    if (opportunity.image) score += 1;
    
    // Closer opportunities get higher score (for in-person)
    if (opportunity.type === 'in-person' && opportunity.distance !== undefined) {
      if (opportunity.distance < 5) score += 5;
      else if (opportunity.distance < 15) score += 3;
      else if (opportunity.distance < 30) score += 1;
    }
    
    return score;
  }

  /**
   * Get available filter options from a set of opportunities
   */
  getAvailableFilterOptions(opportunities: VolunteerOpportunity[]): {
    causes: string[];
    skills: string[];
    timeCommitments: string[];
    organizations: string[];
    dateRange: { earliest: Date; latest: Date };
  } {
    const causes = new Set<string>();
    const skills = new Set<string>();
    const timeCommitments = new Set<string>();
    const organizations = new Set<string>();
    const dates: Date[] = [];

    opportunities.forEach(opp => {
      causes.add(opp.cause);
      organizations.add(opp.organization);
      timeCommitments.add(opp.timeCommitment);
      dates.push(new Date(opp.date));
      opp.skills.forEach(skill => skills.add(skill));
    });

    dates.sort((a, b) => a.getTime() - b.getTime());

    return {
      causes: Array.from(causes).sort(),
      skills: Array.from(skills).sort(),
      timeCommitments: Array.from(timeCommitments).sort(),
      organizations: Array.from(organizations).sort(),
      dateRange: {
        earliest: dates[0] || new Date(),
        latest: dates[dates.length - 1] || new Date()
      }
    };
  }

  /**
   * Create search filters from legacy filter format
   */
  convertLegacyFilters(legacyFilters: SearchFilters): FilterOptions {
    return {
      causes: legacyFilters.causes,
      type: legacyFilters.type,
      timeCommitment: legacyFilters.timeCommitment ? [legacyFilters.timeCommitment] : undefined,
      skills: legacyFilters.skills
    };
  }
}

// Export singleton instance
export const filteringSortingService = new FilteringSortingService();