export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          plan: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          plan?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          plan?: string;
          created_at?: string;
        };
      };
      github_profiles: {
        Row: {
          id: string;
          user_id: string;
          login: string;
          access_token_enc: string | null;
          profile_json: Json | null;
          fetched_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          login: string;
          access_token_enc?: string | null;
          profile_json?: Json | null;
          fetched_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          login?: string;
          access_token_enc?: string | null;
          profile_json?: Json | null;
          fetched_at?: string | null;
        };
      };
      resumes: {
        Row: {
          id: string;
          user_id: string;
          version: number;
          base_resume_id: string | null;
          job_id: string | null;
          content: Json;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          version?: number;
          base_resume_id?: string | null;
          job_id?: string | null;
          content: Json;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          version?: number;
          base_resume_id?: string | null;
          job_id?: string | null;
          content?: Json;
          status?: string;
          created_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          source: string | null;
          source_url: string | null;
          parsed: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string | null;
          source_url?: string | null;
          parsed?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string | null;
          source_url?: string | null;
          parsed?: Json | null;
          created_at?: string;
        };
      };
      fit_results: {
        Row: {
          id: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          resume_id: string;
          job_id: string;
          result: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          resume_id?: string;
          job_id?: string;
          result?: Json;
          created_at?: string;
        };
      };
      interview_sessions: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          status: string;
          questions: Json | null;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          status?: string;
          questions?: Json | null;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string;
          status?: string;
          questions?: Json | null;
          started_at?: string | null;
          completed_at?: string | null;
        };
      };
      answers: {
        Row: {
          id: string;
          session_id: string;
          question_index: number;
          answer_text: string;
          feedback: Json | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          question_index: number;
          answer_text: string;
          feedback?: Json | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          question_index?: number;
          answer_text?: string;
          feedback?: Json | null;
        };
      };
      interview_summaries: {
        Row: {
          id: string;
          session_id: string;
          summary: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          summary: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          summary?: Json;
          created_at?: string;
        };
      };
      usage_counters: {
        Row: {
          user_id: string;
          period: string;
          resumes_count: number;
          interviews_count: number;
        };
        Insert: {
          user_id: string;
          period: string;
          resumes_count?: number;
          interviews_count?: number;
        };
        Update: {
          user_id?: string;
          period?: string;
          resumes_count?: number;
          interviews_count?: number;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
