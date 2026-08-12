/**
 * Database types, hand-written to match supabase/migrations exactly.
 *
 * The shape follows what `supabase gen types typescript` emits — including the
 * `Relationships` arrays — because supabase-js validates the schema against its
 * internal `GenericSchema`. Omit `Relationships` and every query silently
 * degrades to `never`, which is why this file is not just `Row` definitions.
 *
 * Regenerate once the project exists:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          full_name: string;
          employee_id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          status: Database['public']['Enums']['user_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          full_name: string;
          employee_id: string;
          email: string;
          role?: Database['public']['Enums']['user_role'];
          status?: Database['public']['Enums']['user_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          full_name?: string;
          employee_id?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          status?: Database['public']['Enums']['user_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_auth_user_id_fkey';
            columns: ['auth_user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      production_lines: {
        Row: {
          id: string;
          line_number: number;
          line_name: string;
          department: string | null;
          status: Database['public']['Enums']['line_status'];
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_number: number;
          line_name: string;
          department?: string | null;
          status?: Database['public']['Enums']['line_status'];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          line_number?: number;
          line_name?: string;
          department?: string | null;
          status?: Database['public']['Enums']['line_status'];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      orders: {
        Row: {
          id: string;
          order_number: string;
          buyer: string;
          style_number: string | null;
          product_name: string | null;
          color: string | null;
          size: string | null;
          order_quantity: number;
          produced_quantity: number;
          /** Generated column — never writable. */
          remaining_quantity: number;
          target_quantity: number;
          delivery_date: string | null;
          production_status: Database['public']['Enums']['prod_status'];
          delivery_status: Database['public']['Enums']['delivery_status'];
          production_line_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          buyer: string;
          style_number?: string | null;
          product_name?: string | null;
          color?: string | null;
          size?: string | null;
          order_quantity?: number;
          produced_quantity?: number;
          target_quantity?: number;
          delivery_date?: string | null;
          production_status?: Database['public']['Enums']['prod_status'];
          delivery_status?: Database['public']['Enums']['delivery_status'];
          production_line_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          buyer?: string;
          style_number?: string | null;
          product_name?: string | null;
          color?: string | null;
          size?: string | null;
          order_quantity?: number;
          produced_quantity?: number;
          target_quantity?: number;
          delivery_date?: string | null;
          production_status?: Database['public']['Enums']['prod_status'];
          delivery_status?: Database['public']['Enums']['delivery_status'];
          production_line_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_production_line_id_fkey';
            columns: ['production_line_id'];
            isOneToOne: false;
            referencedRelation: 'production_lines';
            referencedColumns: ['id'];
          }
        ];
      };

      excel_uploads: {
        Row: {
          id: string;
          uploaded_by: string;
          original_filename: string;
          compressed_filename: string;
          storage_path: string;
          original_file_size: number;
          compressed_file_size: number;
          compression_type: string;
          file_hash: string;
          row_count: number;
          column_count: number;
          sheet_count: number;
          valid_record_count: number;
          warning_count: number;
          error_count: number;
          duplicate_count: number;
          processing_status: Database['public']['Enums']['processing_state'];
          processing_ms: number | null;
          upload_version: number;
          parent_upload_id: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          uploaded_by: string;
          original_filename: string;
          compressed_filename: string;
          storage_path: string;
          original_file_size: number;
          compressed_file_size: number;
          compression_type?: string;
          file_hash: string;
          row_count?: number;
          column_count?: number;
          sheet_count?: number;
          valid_record_count?: number;
          warning_count?: number;
          error_count?: number;
          duplicate_count?: number;
          processing_status?: Database['public']['Enums']['processing_state'];
          processing_ms?: number | null;
          upload_version?: number;
          parent_upload_id?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          uploaded_by?: string;
          original_filename?: string;
          compressed_filename?: string;
          storage_path?: string;
          original_file_size?: number;
          compressed_file_size?: number;
          compression_type?: string;
          file_hash?: string;
          row_count?: number;
          column_count?: number;
          sheet_count?: number;
          valid_record_count?: number;
          warning_count?: number;
          error_count?: number;
          duplicate_count?: number;
          processing_status?: Database['public']['Enums']['processing_state'];
          processing_ms?: number | null;
          upload_version?: number;
          parent_upload_id?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'excel_uploads_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excel_uploads_parent_upload_id_fkey';
            columns: ['parent_upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          }
        ];
      };

      excel_versions: {
        Row: {
          id: string;
          upload_id: string;
          parent_upload_id: string | null;
          version_number: number;
          original_filename: string;
          storage_path: string;
          file_hash: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          parent_upload_id?: string | null;
          version_number: number;
          original_filename: string;
          storage_path: string;
          file_hash: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          parent_upload_id?: string | null;
          version_number?: number;
          original_filename?: string;
          storage_path?: string;
          file_hash?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'excel_versions_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excel_versions_parent_upload_id_fkey';
            columns: ['parent_upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excel_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      production_records: {
        Row: {
          id: string;
          order_id: string | null;
          production_line_id: string;
          production_date: string;
          target_quantity: number;
          actual_quantity: number;
          efficiency: number | null;
          status: string | null;
          source_upload_id: string | null;
          source_row_number: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          production_line_id: string;
          production_date: string;
          target_quantity?: number;
          actual_quantity?: number;
          efficiency?: number | null;
          status?: string | null;
          source_upload_id?: string | null;
          source_row_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          production_line_id?: string;
          production_date?: string;
          target_quantity?: number;
          actual_quantity?: number;
          efficiency?: number | null;
          status?: string | null;
          source_upload_id?: string | null;
          source_row_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'production_records_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'production_records_production_line_id_fkey';
            columns: ['production_line_id'];
            isOneToOne: false;
            referencedRelation: 'production_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'production_records_source_upload_id_fkey';
            columns: ['source_upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          }
        ];
      };

      excel_rows: {
        Row: {
          id: string;
          upload_id: string;
          row_number: number;
          raw_data: Json;
          processing_status: string;
          error_message: string | null;
          warning_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          row_number: number;
          raw_data: Json;
          processing_status?: string;
          error_message?: string | null;
          warning_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          row_number?: number;
          raw_data?: Json;
          processing_status?: string;
          error_message?: string | null;
          warning_message?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'excel_rows_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          }
        ];
      };

      import_errors: {
        Row: {
          id: string;
          upload_id: string;
          row_number: number | null;
          column_name: string | null;
          error_type: string;
          error_message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          row_number?: number | null;
          column_name?: string | null;
          error_type: string;
          error_message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          row_number?: number | null;
          column_name?: string | null;
          error_type?: string;
          error_message?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_errors_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          }
        ];
      };

      import_warnings: {
        Row: {
          id: string;
          upload_id: string;
          row_number: number | null;
          column_name: string | null;
          warning_message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id: string;
          row_number?: number | null;
          column_name?: string | null;
          warning_message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          upload_id?: string;
          row_number?: number | null;
          column_name?: string | null;
          warning_message?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_warnings_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'excel_uploads';
            referencedColumns: ['id'];
          }
        ];
      };

      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          description: string | null;
          metadata: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          description?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          description?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };

    Views: Record<never, never>;

    Functions: {
      current_profile_id: { Args: Record<PropertyKey, never>; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };

    Enums: {
      user_role: 'admin' | 'employee';
      user_status: 'active' | 'disabled';
      line_status: 'running' | 'behind' | 'changeover' | 'idle';
      prod_status: 'pending' | 'in_production' | 'at_risk' | 'completed';
      delivery_status: 'on_time' | 'upcoming' | 'delayed' | 'completed';
      processing_state: 'pending' | 'scanning' | 'imported' | 'warnings' | 'failed';
    };

    CompositeTypes: Record<never, never>;
  };
}
