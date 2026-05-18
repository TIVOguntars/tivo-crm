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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      click_events: {
        Row: {
          channel: string | null
          clicked_at: string
          communication_id: string
          created_at: string
          id: string
          ip: string | null
          lead_id: string
          metadata: Json
          object_id: string | null
          person_id: string | null
          raw_payload: Json
          referer: string | null
          referrer: string | null
          tracking_link_id: string
          user_agent: string | null
        }
        Insert: {
          channel?: string | null
          clicked_at?: string
          communication_id: string
          created_at?: string
          id?: string
          ip?: string | null
          lead_id: string
          metadata?: Json
          object_id?: string | null
          person_id?: string | null
          raw_payload?: Json
          referer?: string | null
          referrer?: string | null
          tracking_link_id: string
          user_agent?: string | null
        }
        Update: {
          channel?: string | null
          clicked_at?: string
          communication_id?: string
          created_at?: string
          id?: string
          ip?: string | null
          lead_id?: string
          metadata?: Json
          object_id?: string | null
          person_id?: string | null
          raw_payload?: Json
          referer?: string | null
          referrer?: string | null
          tracking_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "click_events_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_events_tracking_link_id_fkey"
            columns: ["tracking_link_id"]
            isOneToOne: false
            referencedRelation: "tracking_links"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_events: {
        Row: {
          channel: string
          communication_id: string
          created_at: string
          event_at: string | null
          event_timestamp: string
          event_type: string
          id: string
          lead_id: string
          link_url: string | null
          metadata: Json
          object_id: string | null
          person_id: string | null
          provider: string | null
          provider_event_id: string | null
          provider_message_id: string | null
          raw_payload: Json | null
          tracking_link_id: string | null
        }
        Insert: {
          channel: string
          communication_id: string
          created_at?: string
          event_at?: string | null
          event_timestamp?: string
          event_type: string
          id?: string
          lead_id: string
          link_url?: string | null
          metadata?: Json
          object_id?: string | null
          person_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          tracking_link_id?: string | null
        }
        Update: {
          channel?: string
          communication_id?: string
          created_at?: string
          event_at?: string | null
          event_timestamp?: string
          event_type?: string
          id?: string
          lead_id?: string
          link_url?: string | null
          metadata?: Json
          object_id?: string | null
          person_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          tracking_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_events_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          attachments_info: string | null
          automation_step: string | null
          campaign_id: string | null
          channel: string
          content_ref: string | null
          created_at: string
          current_status: string | null
          delivered_at: string | null
          direction: string
          failed_at: string | null
          from_address: string | null
          html_body: string | null
          id: string
          in_reply_to: string | null
          inbound_mailbox: string | null
          lead_id: string
          matched_by: string | null
          message_id: string | null
          metadata: Json
          object_id: string | null
          parent_communication_id: string | null
          person_id: string | null
          provider: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          received_at: string | null
          reference_code: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_key: string | null
          text_body: string | null
          to_address: string | null
          updated_at: string
        }
        Insert: {
          attachments_info?: string | null
          automation_step?: string | null
          campaign_id?: string | null
          channel: string
          content_ref?: string | null
          created_at?: string
          current_status?: string | null
          delivered_at?: string | null
          direction: string
          failed_at?: string | null
          from_address?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          inbound_mailbox?: string | null
          lead_id: string
          matched_by?: string | null
          message_id?: string | null
          metadata?: Json
          object_id?: string | null
          parent_communication_id?: string | null
          person_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          reference_code?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          text_body?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Update: {
          attachments_info?: string | null
          automation_step?: string | null
          campaign_id?: string | null
          channel?: string
          content_ref?: string | null
          created_at?: string
          current_status?: string | null
          delivered_at?: string | null
          direction?: string
          failed_at?: string | null
          from_address?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          inbound_mailbox?: string | null
          lead_id?: string
          matched_by?: string | null
          message_id?: string | null
          metadata?: Json
          object_id?: string | null
          parent_communication_id?: string | null
          person_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          reference_code?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
          text_body?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_raw: {
        Row: {
          attachment_names: string[] | null
          created_at: string
          from_email: string | null
          html_body: string | null
          id: string
          in_reply_to: string | null
          mailbox: string | null
          matched_by: string | null
          matched_communication_id: string | null
          matched_lead_id: string | null
          message_id: string | null
          processing_status: string
          raw_payload: Json | null
          reference_code: string | null
          subject: string | null
          text_body: string | null
          to_email: string | null
        }
        Insert: {
          attachment_names?: string[] | null
          created_at?: string
          from_email?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          mailbox?: string | null
          matched_by?: string | null
          matched_communication_id?: string | null
          matched_lead_id?: string | null
          message_id?: string | null
          processing_status?: string
          raw_payload?: Json | null
          reference_code?: string | null
          subject?: string | null
          text_body?: string | null
          to_email?: string | null
        }
        Update: {
          attachment_names?: string[] | null
          created_at?: string
          from_email?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          mailbox?: string | null
          matched_by?: string | null
          matched_communication_id?: string | null
          matched_lead_id?: string | null
          message_id?: string | null
          processing_status?: string
          raw_payload?: Json | null
          reference_code?: string | null
          subject?: string | null
          text_body?: string | null
          to_email?: string | null
        }
        Relationships: []
      }
      lead_milestones: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          metadata: Json
          milestone_at: string
          milestone_key: string
          source_ref: string | null
          source_system: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json
          milestone_at: string
          milestone_key: string
          source_ref?: string | null
          source_system?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
          milestone_at?: string
          milestone_key?: string
          source_ref?: string | null
          source_system?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_milestones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          atbildigais: string | null
          atcelsanas_iemesls: string | null
          automatizacija: string | null
          automatizacijas_datums: string | null
          avots_detalizets: string | null
          b2b: boolean | null
          created_at: string
          email_normalized: string
          email_raw: string
          external_id: string | null
          forma_projekts: string | null
          forma_zeme: string | null
          forma_zina_no_lead: string | null
          full_name: string | null
          id: string
          is_handled: boolean | null
          last_smartsheet_change_at: string | null
          last_supabase_change_at: string | null
          last_sync_direction: string | null
          last_writeback_to_smartsheet_at: string | null
          metadata: Json
          nakama_darbiba: string | null
          objekts: string | null
          pedejas_sazinas_datums: string | null
          planota_buvnieciba: string | null
          planota_buvnieciba_text: string | null
          platiba_m2: number | null
          ppv_epasts: string | null
          ppv_talrunis: string | null
          ppv_vards: string | null
          reitings: number | null
          situacijas_piezimes: string | null
          smartsheet_created_at: string | null
          snooze_reason: string | null
          snooze_until: string | null
          source: string | null
          status: string | null
          summa: number | null
          sync_conflict_reason: string | null
          synced_at: string | null
          tags: string | null
          telefons_e164: string | null
          telefons_neapstradats: string | null
          termins: string | null
          valsts: string | null
        }
        Insert: {
          atbildigais?: string | null
          atcelsanas_iemesls?: string | null
          automatizacija?: string | null
          automatizacijas_datums?: string | null
          avots_detalizets?: string | null
          b2b?: boolean | null
          created_at?: string
          email_normalized: string
          email_raw: string
          external_id?: string | null
          forma_projekts?: string | null
          forma_zeme?: string | null
          forma_zina_no_lead?: string | null
          full_name?: string | null
          id?: string
          is_handled?: boolean | null
          last_smartsheet_change_at?: string | null
          last_supabase_change_at?: string | null
          last_sync_direction?: string | null
          last_writeback_to_smartsheet_at?: string | null
          metadata?: Json
          nakama_darbiba?: string | null
          objekts?: string | null
          pedejas_sazinas_datums?: string | null
          planota_buvnieciba?: string | null
          planota_buvnieciba_text?: string | null
          platiba_m2?: number | null
          ppv_epasts?: string | null
          ppv_talrunis?: string | null
          ppv_vards?: string | null
          reitings?: number | null
          situacijas_piezimes?: string | null
          smartsheet_created_at?: string | null
          snooze_reason?: string | null
          snooze_until?: string | null
          source?: string | null
          status?: string | null
          summa?: number | null
          sync_conflict_reason?: string | null
          synced_at?: string | null
          tags?: string | null
          telefons_e164?: string | null
          telefons_neapstradats?: string | null
          termins?: string | null
          valsts?: string | null
        }
        Update: {
          atbildigais?: string | null
          atcelsanas_iemesls?: string | null
          automatizacija?: string | null
          automatizacijas_datums?: string | null
          avots_detalizets?: string | null
          b2b?: boolean | null
          created_at?: string
          email_normalized?: string
          email_raw?: string
          external_id?: string | null
          forma_projekts?: string | null
          forma_zeme?: string | null
          forma_zina_no_lead?: string | null
          full_name?: string | null
          id?: string
          is_handled?: boolean | null
          last_smartsheet_change_at?: string | null
          last_supabase_change_at?: string | null
          last_sync_direction?: string | null
          last_writeback_to_smartsheet_at?: string | null
          metadata?: Json
          nakama_darbiba?: string | null
          objekts?: string | null
          pedejas_sazinas_datums?: string | null
          planota_buvnieciba?: string | null
          planota_buvnieciba_text?: string | null
          platiba_m2?: number | null
          ppv_epasts?: string | null
          ppv_talrunis?: string | null
          ppv_vards?: string | null
          reitings?: number | null
          situacijas_piezimes?: string | null
          smartsheet_created_at?: string | null
          snooze_reason?: string | null
          snooze_until?: string | null
          source?: string | null
          status?: string | null
          summa?: number | null
          sync_conflict_reason?: string | null
          synced_at?: string | null
          tags?: string | null
          telefons_e164?: string | null
          telefons_neapstradats?: string | null
          termins?: string | null
          valsts?: string | null
        }
        Relationships: []
      }
      resend_import: {
        Row: {
          api_key_id: string | null
          bcc: string | null
          cc: string | null
          created_at: string | null
          from: string | null
          id: string
          last_event: string | null
          reply_to: string | null
          scheduled_at: string | null
          sent_at: string | null
          subject: string | null
          to: string | null
        }
        Insert: {
          api_key_id?: string | null
          bcc?: string | null
          cc?: string | null
          created_at?: string | null
          from?: string | null
          id: string
          last_event?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          subject?: string | null
          to?: string | null
        }
        Update: {
          api_key_id?: string | null
          bcc?: string | null
          cc?: string | null
          created_at?: string | null
          from?: string | null
          id?: string
          last_event?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          subject?: string | null
          to?: string | null
        }
        Relationships: []
      }
      smartsheet_current_snapshot: {
        Row: {
          atbildigais: string | null
          atcelsanas_iemesls: string | null
          automatizacija: string | null
          automatizacijas_datums: string | null
          avots: string | null
          b2b: string | null
          captured_at: string
          email: string | null
          email_normalized: string | null
          full_name: string | null
          nakama_darbiba: string | null
          objekts: string | null
          pedejas_sazinas_datums: string | null
          ppv: string | null
          raw_row: Json
          reitings: string | null
          row_id: string
          statuss: string | null
          tags: string | null
          telefons: string | null
          termins: string | null
          valsts: string | null
        }
        Insert: {
          atbildigais?: string | null
          atcelsanas_iemesls?: string | null
          automatizacija?: string | null
          automatizacijas_datums?: string | null
          avots?: string | null
          b2b?: string | null
          captured_at?: string
          email?: string | null
          email_normalized?: string | null
          full_name?: string | null
          nakama_darbiba?: string | null
          objekts?: string | null
          pedejas_sazinas_datums?: string | null
          ppv?: string | null
          raw_row?: Json
          reitings?: string | null
          row_id: string
          statuss?: string | null
          tags?: string | null
          telefons?: string | null
          termins?: string | null
          valsts?: string | null
        }
        Update: {
          atbildigais?: string | null
          atcelsanas_iemesls?: string | null
          automatizacija?: string | null
          automatizacijas_datums?: string | null
          avots?: string | null
          b2b?: string | null
          captured_at?: string
          email?: string | null
          email_normalized?: string | null
          full_name?: string | null
          nakama_darbiba?: string | null
          objekts?: string | null
          pedejas_sazinas_datums?: string | null
          ppv?: string | null
          raw_row?: Json
          reitings?: string | null
          row_id?: string
          statuss?: string | null
          tags?: string | null
          telefons?: string | null
          termins?: string | null
          valsts?: string | null
        }
        Relationships: []
      }
      smartsheet_daily_state: {
        Row: {
          day: string
          sent_count: number
          stopped: boolean
          stopped_reason: string | null
          updated_at: string
        }
        Insert: {
          day: string
          sent_count?: number
          stopped?: boolean
          stopped_reason?: string | null
          updated_at?: string
        }
        Update: {
          day?: string
          sent_count?: number
          stopped?: boolean
          stopped_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      smartsheet_sheet_events: {
        Row: {
          change_agent: string | null
          column_id: number | null
          created_at: string
          event_timestamp: string | null
          event_type: string | null
          id: string
          object_id: number | null
          object_type: string | null
          raw_event: Json
          row_id: number | null
          scope_object_id: number | null
          user_id: number | null
          webhook_event_id: string
          webhook_id: number | null
        }
        Insert: {
          change_agent?: string | null
          column_id?: number | null
          created_at?: string
          event_timestamp?: string | null
          event_type?: string | null
          id?: string
          object_id?: number | null
          object_type?: string | null
          raw_event: Json
          row_id?: number | null
          scope_object_id?: number | null
          user_id?: number | null
          webhook_event_id: string
          webhook_id?: number | null
        }
        Update: {
          change_agent?: string | null
          column_id?: number | null
          created_at?: string
          event_timestamp?: string | null
          event_type?: string | null
          id?: string
          object_id?: number | null
          object_type?: string | null
          raw_event?: Json
          row_id?: number | null
          scope_object_id?: number | null
          user_id?: number | null
          webhook_event_id?: string
          webhook_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "smartsheet_sheet_events_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "smartsheet_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      smartsheet_webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          headers: Json | null
          id: string
          payload: Json
          processed: boolean
          source: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          headers?: Json | null
          id?: string
          payload: Json
          processed?: boolean
          source?: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          headers?: Json | null
          id?: string
          payload?: Json
          processed?: boolean
          source?: string
        }
        Relationships: []
      }
      system_flags: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      tracking_links: {
        Row: {
          campaign_id: string | null
          channel: string | null
          communication_id: string
          created_at: string
          destination_url: string | null
          id: string
          lead_id: string
          link_key: string | null
          metadata: Json
          object_id: string | null
          original_url: string
          person_id: string | null
          tracking_code: string
        }
        Insert: {
          campaign_id?: string | null
          channel?: string | null
          communication_id: string
          created_at?: string
          destination_url?: string | null
          id?: string
          lead_id: string
          link_key?: string | null
          metadata?: Json
          object_id?: string | null
          original_url: string
          person_id?: string | null
          tracking_code: string
        }
        Update: {
          campaign_id?: string | null
          channel?: string | null
          communication_id?: string
          created_at?: string
          destination_url?: string | null
          id?: string
          lead_id?: string
          link_key?: string | null
          metadata?: Json
          object_id?: string | null
          original_url?: string
          person_id?: string | null
          tracking_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_links_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      smartsheet_new_leads_queue: {
        Row: {
          row_id: string | null
        }
        Relationships: []
      }
      smartsheet_supabase_diff_for_writeback: {
        Row: {
          row_id: string | null
          supabase_status: string | null
        }
        Relationships: []
      }
      smartsheet_writeback_queue: {
        Row: {
          row_id: string | null
          write_status: string | null
          write_tags: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_dashboard_kpis: { Args: never; Returns: Json }
      get_dashboard_summary: { Args: never; Returns: Json }
      process_inbound_email: {
        Args: {
          p_attachment_names?: string[]
          p_from_email: string
          p_html_body?: string
          p_in_reply_to?: string
          p_mailbox: string
          p_message_id?: string
          p_raw_payload?: Json
          p_subject: string
          p_text_body?: string
          p_to_email: string
        }
        Returns: Json
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
