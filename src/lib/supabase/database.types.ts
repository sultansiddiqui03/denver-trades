export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_feed: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          company_id: string | null
          created_at: string | null
          deal_id: string | null
          details: Json | null
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          company_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          details?: Json | null
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          company_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          details?: Json | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_name: string
          completed_at: string | null
          error_log: string | null
          id: string
          org_id: string
          records_created: number | null
          records_processed: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          error_log?: string | null
          id?: string
          org_id: string
          records_created?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          error_log?: string | null
          id?: string
          org_id?: string
          records_created?: number | null
          records_processed?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commodity_prices: {
        Row: {
          commodity: string
          id: string
          origin_country: string | null
          price_usd: number
          recorded_at: string | null
          source: string | null
          unit: string | null
        }
        Insert: {
          commodity: string
          id?: string
          origin_country?: string | null
          price_usd: number
          recorded_at?: string | null
          source?: string | null
          unit?: string | null
        }
        Update: {
          commodity?: string
          id?: string
          origin_country?: string | null
          price_usd?: number
          recorded_at?: string | null
          source?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          buyer_fit_score: number | null
          confidence_score: number | null
          contacts: Json | null
          created_at: string | null
          description: string | null
          destination_countries: string[] | null
          embedding: string | null
          enriched_at: string | null
          enrichment_source: string | null
          hq_city: string | null
          hq_country: string | null
          hs_codes: Json | null
          id: string
          is_enriched: boolean | null
          is_favorited: boolean | null
          last_shipment_date: string | null
          name: string
          org_id: string
          origin_countries: string[] | null
          products_dealt: string[] | null
          score_breakdown: Json | null
          scored_at: string | null
          source_url: string | null
          sources: Json
          sourcing_signal: Json | null
          sourcing_signal_at: string | null
          tags: string[] | null
          top_suppliers: Json | null
          top_trading_partners: Json | null
          total_shipments: number | null
          trade_metrics: Json | null
          trademarks: Json | null
          type: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          buyer_fit_score?: number | null
          confidence_score?: number | null
          contacts?: Json | null
          created_at?: string | null
          description?: string | null
          destination_countries?: string[] | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hs_codes?: Json | null
          id?: string
          is_enriched?: boolean | null
          is_favorited?: boolean | null
          last_shipment_date?: string | null
          name: string
          org_id: string
          origin_countries?: string[] | null
          products_dealt?: string[] | null
          score_breakdown?: Json | null
          scored_at?: string | null
          source_url?: string | null
          sources?: Json
          sourcing_signal?: Json | null
          sourcing_signal_at?: string | null
          tags?: string[] | null
          top_suppliers?: Json | null
          top_trading_partners?: Json | null
          total_shipments?: number | null
          trade_metrics?: Json | null
          trademarks?: Json | null
          type?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          buyer_fit_score?: number | null
          confidence_score?: number | null
          contacts?: Json | null
          created_at?: string | null
          description?: string | null
          destination_countries?: string[] | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hs_codes?: Json | null
          id?: string
          is_enriched?: boolean | null
          is_favorited?: boolean | null
          last_shipment_date?: string | null
          name?: string
          org_id?: string
          origin_countries?: string[] | null
          products_dealt?: string[] | null
          score_breakdown?: Json | null
          scored_at?: string | null
          source_url?: string | null
          sources?: Json
          sourcing_signal?: Json | null
          sourcing_signal_at?: string | null
          tags?: string[] | null
          top_suppliers?: Json | null
          top_trading_partners?: Json | null
          total_shipments?: number | null
          trade_metrics?: Json | null
          trademarks?: Json | null
          type?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals_pipeline: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          created_at: string | null
          deal_code: string | null
          expected_close_date: string | null
          id: string
          incoterm: string | null
          kanban_order: number | null
          notes: string | null
          org_id: string
          payment_terms: string | null
          port_discharge: string | null
          port_loading: string | null
          product: string | null
          quantity_mt: number | null
          stage: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          value_usd: number | null
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_code?: string | null
          expected_close_date?: string | null
          id?: string
          incoterm?: string | null
          kanban_order?: number | null
          notes?: string | null
          org_id: string
          payment_terms?: string | null
          port_discharge?: string | null
          port_loading?: string | null
          product?: string | null
          quantity_mt?: number | null
          stage?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          value_usd?: number | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_code?: string | null
          expected_close_date?: string | null
          id?: string
          incoterm?: string | null
          kanban_order?: number | null
          notes?: string | null
          org_id?: string
          payment_terms?: string | null
          port_discharge?: string | null
          port_loading?: string | null
          product?: string | null
          quantity_mt?: number | null
          stage?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          value_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_pipeline_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audits: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deal_id: string | null
          discrepancies: Json | null
          doc_path_a: string
          doc_path_b: string
          doc_type_a: string
          doc_type_b: string
          id: string
          org_id: string
          report_pdf_path: string | null
          status: string | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          discrepancies?: Json | null
          doc_path_a: string
          doc_path_b: string
          doc_type_a: string
          doc_type_b: string
          id?: string
          org_id: string
          report_pdf_path?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          discrepancies?: Json | null
          doc_path_a?: string
          doc_path_b?: string
          doc_type_a?: string
          doc_type_b?: string
          id?: string
          org_id?: string
          report_pdf_path?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_audits_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_audits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intel: {
        Row: {
          fetched_at: string
          hs_breakdown: Json | null
          id: string
          product: string
          sample_shipments: Json | null
          source: string
          summary: Json | null
          top_destinations: Json | null
          total_records: number | null
          trade_type: string
        }
        Insert: {
          fetched_at?: string
          hs_breakdown?: Json | null
          id?: string
          product: string
          sample_shipments?: Json | null
          source?: string
          summary?: Json | null
          top_destinations?: Json | null
          total_records?: number | null
          trade_type: string
        }
        Update: {
          fetched_at?: string
          hs_breakdown?: Json | null
          id?: string
          product?: string
          sample_shipments?: Json | null
          source?: string
          summary?: Json | null
          top_destinations?: Json | null
          total_records?: number | null
          trade_type?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          org_id: string
          title: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          org_id: string
          title: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          org_id?: string
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          company_id: string | null
          created_at: string | null
          dedupe_key: string
          evidence: Json | null
          id: string
          org_id: string
          priority: number
          product: string | null
          status: string
          summary: string | null
          thread_id: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          dedupe_key: string
          evidence?: Json | null
          id?: string
          org_id: string
          priority?: number
          product?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          dedupe_key?: string
          evidence?: Json | null
          id?: string
          org_id?: string
          priority?: number
          product?: string | null
          status?: string
          summary?: string | null
          thread_id?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "outreach_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          commodities: string[] | null
          created_at: string | null
          deal_code_prefix: string
          id: string
          logo_url: string | null
          name: string
          onboarding_complete: boolean | null
          settings: Json | null
          slug: string
          target_markets: string[] | null
          twilio_whatsapp_number: string | null
          updated_at: string | null
        }
        Insert: {
          commodities?: string[] | null
          created_at?: string | null
          deal_code_prefix?: string
          id?: string
          logo_url?: string | null
          name: string
          onboarding_complete?: boolean | null
          settings?: Json | null
          slug: string
          target_markets?: string[] | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
        }
        Update: {
          commodities?: string[] | null
          created_at?: string | null
          deal_code_prefix?: string
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_complete?: boolean | null
          settings?: Json | null
          slug?: string
          target_markets?: string[] | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outreach_threads: {
        Row: {
          ai_generated: boolean | null
          channel: string | null
          company_id: string | null
          created_at: string | null
          deal_id: string | null
          direction: string | null
          extracted_demand: Json | null
          extracted_terms: Json | null
          id: string
          language: string | null
          message_content: string
          needs_review: boolean | null
          org_id: string
          recipient: string | null
          sender: string | null
          status: string | null
          subject: string | null
          twilio_message_sid: string | null
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string | null
          extracted_demand?: Json | null
          extracted_terms?: Json | null
          id?: string
          language?: string | null
          message_content: string
          needs_review?: boolean | null
          org_id: string
          recipient?: string | null
          sender?: string | null
          status?: string | null
          subject?: string | null
          twilio_message_sid?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          channel?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string | null
          extracted_demand?: Json | null
          extracted_terms?: Json | null
          id?: string
          language?: string | null
          message_content?: string
          needs_review?: boolean | null
          org_id?: string
          recipient?: string | null
          sender?: string | null
          status?: string | null
          subject?: string | null
          twilio_message_sid?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_threads_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alert_enabled: boolean | null
          created_at: string | null
          filters: Json | null
          id: string
          last_result_count: number | null
          name: string
          org_id: string
          query: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_enabled?: boolean | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          last_result_count?: number | null
          name: string
          org_id: string
          query: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_enabled?: boolean | null
          created_at?: string | null
          filters?: Json | null
          id?: string
          last_result_count?: number | null
          name?: string
          org_id?: string
          query?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          company_id: string | null
          container_count: number | null
          created_at: string | null
          destination_country: string | null
          hs_code: string | null
          id: string
          incoterm: string | null
          org_id: string
          origin_country: string | null
          port_discharge: string | null
          port_loading: string | null
          product: string
          quantity_mt: number | null
          shipment_date: string | null
          source_reference: string | null
          supplier_name: string | null
          updated_at: string | null
          value_usd: number | null
          weight_kg: number | null
        }
        Insert: {
          carrier?: string | null
          company_id?: string | null
          container_count?: number | null
          created_at?: string | null
          destination_country?: string | null
          hs_code?: string | null
          id?: string
          incoterm?: string | null
          org_id: string
          origin_country?: string | null
          port_discharge?: string | null
          port_loading?: string | null
          product: string
          quantity_mt?: number | null
          shipment_date?: string | null
          source_reference?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          value_usd?: number | null
          weight_kg?: number | null
        }
        Update: {
          carrier?: string | null
          company_id?: string | null
          container_count?: number | null
          created_at?: string | null
          destination_country?: string | null
          hs_code?: string | null
          id?: string
          incoterm?: string | null
          org_id?: string
          origin_country?: string | null
          port_discharge?: string | null
          port_loading?: string | null
          product?: string
          quantity_mt?: number | null
          shipment_date?: string | null
          source_reference?: string | null
          supplier_name?: string | null
          updated_at?: string | null
          value_usd?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          onboarding_step: number | null
          org_id: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          onboarding_step?: number | null
          org_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          onboarding_step?: number | null
          org_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_companies_by_embedding: {
        Args: {
          match_count: number
          match_org_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          hq_country: string
          id: string
          name: string
          products_dealt: string[]
          similarity: number
          type: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
