export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DeviceOrigin =
  | "amazon"
  | "apple_store"
  | "grover"
  | "topi"
  | "other";
export type EnrollmentStatus =
  | "enrolled"
  | "not_enrolled"
  | "pending"
  | "removed"
  | "ready_to_enroll"
  | "pending_enrollment"
  | "returned";
export type EmploymentType = "employee" | "freelancer";
export type OwnershipStatus = "purchased" | "rented";
export type DeviceCategory = "laptop" | "computer" | "phone" | "tablet" | "other";

export type AsanaTask = {
  title: string;
  url: string;
  description: string | null;
};

export type MailLogLabel = "enrollment_reminder" | "return_request";

export type MailLogEntry = {
  label: MailLogLabel;
  recipient: string | null;
  mail_link: string;
  description: string | null;
  sent_at: string | null;
  message_id: string | null;
};

export interface Database {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string;
          serial_number: string | null;
          device_name: string;
          origin: DeviceOrigin | null;
          order_date: string | null;
          enrolled_at: string | null;
          enrollment_status: EnrollmentStatus;
          created_at: string;
          ownership_status: OwnershipStatus | null;
          monthly_price: number | null;
          purchase_price: number | null;
          amazon_order_number: string | null;
          grover_contract_number: string | null;
          category: DeviceCategory;
          asana_tasks: AsanaTask[];
          mail_log: MailLogEntry[];
          last_import_source: string | null;
          last_import_at: string | null;
        };
        Insert: {
          id?: string;
          serial_number?: string | null;
          device_name: string;
          origin?: DeviceOrigin | null;
          order_date?: string | null;
          enrolled_at?: string | null;
          enrollment_status?: EnrollmentStatus;
          created_at?: string;
          ownership_status?: OwnershipStatus | null;
          monthly_price?: number | null;
          purchase_price?: number | null;
          amazon_order_number?: string | null;
          grover_contract_number?: string | null;
          category?: DeviceCategory;
          asana_tasks?: AsanaTask[];
          mail_log?: MailLogEntry[];
          last_import_source?: string | null;
          last_import_at?: string | null;
        };
        Update: {
          id?: string;
          serial_number?: string | null;
          device_name?: string;
          origin?: DeviceOrigin | null;
          order_date?: string | null;
          enrolled_at?: string | null;
          enrollment_status?: EnrollmentStatus;
          created_at?: string;
          ownership_status?: OwnershipStatus | null;
          monthly_price?: number | null;
          purchase_price?: number | null;
          amazon_order_number?: string | null;
          grover_contract_number?: string | null;
          category?: DeviceCategory;
          asana_tasks?: AsanaTask[];
          mail_log?: MailLogEntry[];
          last_import_source?: string | null;
          last_import_at?: string | null;
        };
        Relationships: [];
      };
      device_assignments: {
        Row: {
          id: string;
          device_id: string;
          user_name: string | null;
          user_email: string | null;
          assigned_at: string;
          unassigned_at: string | null;
          changed_by: string | null;
          created_at: string;
          description: string | null;
          mail_link: string | null;
          mail_message_id: string | null;
          mail_recipient: string | null;
        };
        Insert: {
          id?: string;
          device_id: string;
          user_name?: string | null;
          user_email?: string | null;
          assigned_at: string;
          unassigned_at?: string | null;
          changed_by?: string | null;
          created_at?: string;
          description?: string | null;
          mail_link?: string | null;
          mail_message_id?: string | null;
          mail_recipient?: string | null;
        };
        Update: {
          id?: string;
          device_id?: string;
          user_name?: string | null;
          user_email?: string | null;
          assigned_at?: string;
          unassigned_at?: string | null;
          changed_by?: string | null;
          created_at?: string;
          description?: string | null;
          mail_link?: string | null;
          mail_message_id?: string | null;
          mail_recipient?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_assignments_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
      allowed_users: {
        Row: {
          email: string;
          added_at: string;
        };
        Insert: {
          email: string;
          added_at?: string;
        };
        Update: {
          email?: string;
          added_at?: string;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          user_name: string;
          user_email: string;
          employment_type: EmploymentType | null;
          active: boolean;
          updated_at: string;
        };
        Insert: {
          user_name: string;
          user_email: string;
          employment_type?: EmploymentType | null;
          active?: boolean;
          updated_at?: string;
        };
        Update: {
          user_name?: string;
          user_email?: string;
          employment_type?: EmploymentType | null;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      import_devices: {
        Args: { rows: Json };
        Returns: undefined;
      };
      import_returned_devices: {
        Args: { rows: Json; import_source?: string | null; dry_run?: boolean };
        Returns: Json;
      };
      merge_devices: {
        Args: { keep_id: string; duplicate_id: string };
        Returns: undefined;
      };
      import_mail_log: {
        Args: { rows: Json; dry_run?: boolean };
        Returns: Json;
      };
    };
    Enums: {
      device_origin: DeviceOrigin;
      enrollment_status: EnrollmentStatus;
      employment_type: EmploymentType;
      ownership_status: OwnershipStatus;
      device_category: DeviceCategory;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Device = Database["public"]["Tables"]["devices"]["Row"];
export type DeviceAssignment =
  Database["public"]["Tables"]["device_assignments"]["Row"];
export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type EmployeeInfo = Pick<
  Employee,
  "user_email" | "employment_type" | "active"
>;
