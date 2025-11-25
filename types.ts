
export interface VideoEvent {
  timestamp: string;
  seconds: number;
  type: 'Goal' | 'Shot' | 'Pass' | 'Defense' | 'Tactical' | 'Mistake' | 'Transition';
  team: string;
  description: string;
}

export interface TacticalInsight {
  title: string;
  phase: 'Attacking' | 'Defending' | 'Transition A-D' | 'Transition D-A';
  observation: string;
  breakdown?: string[]; // Detailed step-by-step tactical breakdown
  improvement: string; // Tactical fix (Coaching Point)
  drill_name?: string; // Specific drill name
  drill_setup?: string; // Brief setup instructions
  visual_cue: string; // Description of what a diagram should show
  key_moment_timestamp?: string; // MM:SS format for the screenshot
  key_moment_seconds?: number; // Seconds for seeking
}

export interface PlayerInsight {
  player: string; // e.g. "Number 10", "Left Winger"
  action_type: 'Off-Ball Run' | 'Decoy' | 'Defensive Tracking' | 'Pressing' | 'Playmaking';
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  time_start?: string;
  time_end?: string;
}

export interface AnalysisData {
  match_context: string;
  formations: {
    team_a: string;
    team_b: string;
  };
  events: VideoEvent[];
  tactical_insights: TacticalInsight[];
  player_analysis: PlayerInsight[];
}
