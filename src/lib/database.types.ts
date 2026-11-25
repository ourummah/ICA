
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_events": {
                  Row: {
                    "action": string,"actor_profile_id": string | null,"created_at": string,"data": NonNullable<Json>,"entity": string,"entity_id": string | null,"hash": string,"id": string,"prev_hash": string,"seq": number,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_profile_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"hash": string,"id"?: string,"prev_hash": string,"seq": number,"site_id": string
                  }
                  Update: {
                    "action"?: string,"actor_profile_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"hash"?: string,"id"?: string,"prev_hash"?: string,"seq"?: number,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"chemicals": {
                  Row: {
                    "created_at": string,"default_dilution": string | null,"id": string,"name": string,"sds_url": string | null,"site_id": string,"type": Database["public"]['Enums']["chemical_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_dilution"?: string | null,"id"?: string,"name": string,"sds_url"?: string | null,"site_id": string,"type": Database["public"]['Enums']["chemical_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_dilution"?: string | null,"id"?: string,"name"?: string,"sds_url"?: string | null,"site_id"?: string,"type"?: Database["public"]['Enums']["chemical_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chemicals_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"cleaner_pins": {
                  Row: {
                    "pin_hash": string,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "pin_hash": string,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "pin_hash"?: string,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cleaner_pins_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"demo_requests": {
                  Row: {
                    "company": string | null,"created_at": string,"email": string,"id": string,"message": string | null,"name": string,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company"?: string | null,"created_at"?: string,"email": string,"id"?: string,"message"?: string | null,"name": string,"phone"?: string | null
                  }
                  Update: {
                    "company"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"message"?: string | null,"name"?: string,"phone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"devices": {
                  Row: {
                    "auth_user_id": string | null,"created_at": string,"id": string,"label": string,"last_seen_at": string | null,"registered_at": string,"registered_by": string | null,"revoked_at": string | null,"site_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"created_at"?: string,"id"?: string,"label": string,"last_seen_at"?: string | null,"registered_at"?: string,"registered_by"?: string | null,"revoked_at"?: string | null,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"created_at"?: string,"id"?: string,"label"?: string,"last_seen_at"?: string | null,"registered_at"?: string,"registered_by"?: string | null,"revoked_at"?: string | null,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_registered_by_fkey"
      columns: ["registered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devices_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"equipment": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"photo_url": string | null,"site_id": string,"teardown_notes": string | null,"updated_at": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"photo_url"?: string | null,"site_id": string,"teardown_notes"?: string | null,"updated_at"?: string,"zone_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"photo_url"?: string | null,"site_id"?: string,"teardown_notes"?: string | null,"updated_at"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "equipment_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "equipment_zone_id_site_id_fkey"
      columns: ["zone_id","site_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"exceptions": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"severity": Database["public"]['Enums']["exception_severity"],"site_id": string,"status": Database["public"]['Enums']["exception_status"],"step_record_id": string | null,"task_id": string,"type": Database["public"]['Enums']["exception_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity": Database["public"]['Enums']["exception_severity"],"site_id": string,"status"?: Database["public"]['Enums']["exception_status"],"step_record_id"?: string | null,"task_id": string,"type": Database["public"]['Enums']["exception_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: Database["public"]['Enums']["exception_severity"],"site_id"?: string,"status"?: Database["public"]['Enums']["exception_status"],"step_record_id"?: string | null,"task_id"?: string,"type"?: Database["public"]['Enums']["exception_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exceptions_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exceptions_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exceptions_step_record_id_site_id_fkey"
      columns: ["step_record_id","site_id"]
isOneToOne: false
      referencedRelation: "step_records"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "exceptions_task_id_site_id_fkey"
      columns: ["task_id","site_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"org_id": string,"profile_id": string,"role": Database["public"]['Enums']["member_role"],"site_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"org_id": string,"profile_id": string,"role": Database["public"]['Enums']["member_role"],"site_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"org_id"?: string,"profile_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"site_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"note_translations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"site_id": string,"source": Database["public"]['Enums']["translation_source"],"step_record_id": string,"text_en": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"site_id": string,"source": Database["public"]['Enums']["translation_source"],"step_record_id": string,"text_en": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"site_id"?: string,"source"?: Database["public"]['Enums']["translation_source"],"step_record_id"?: string,"text_en"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "note_translations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "note_translations_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "note_translations_step_record_id_site_id_fkey"
      columns: ["step_record_id","site_id"]
isOneToOne: false
      referencedRelation: "step_records"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"organisations": {
                  Row: {
                    "created_at": string,"id": string,"is_demo": boolean,"name": string,"type": Database["public"]['Enums']["org_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name": string,"type": Database["public"]['Enums']["org_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"name"?: string,"type"?: Database["public"]['Enums']["org_type"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"photos": {
                  Row: {
                    "ai_flag": Json | null,"ai_flag_review_result": string | null,"ai_flag_reviewed_by": string | null,"client_photo_id": string,"created_at": string,"device_taken_at": string | null,"id": string,"server_received_at": string,"sha256": string,"site_id": string,"step_record_id": string,"storage_path": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_flag"?: Json | null,"ai_flag_review_result"?: string | null,"ai_flag_reviewed_by"?: string | null,"client_photo_id": string,"created_at"?: string,"device_taken_at"?: string | null,"id"?: string,"server_received_at"?: string,"sha256": string,"site_id": string,"step_record_id": string,"storage_path": string,"updated_at"?: string
                  }
                  Update: {
                    "ai_flag"?: Json | null,"ai_flag_review_result"?: string | null,"ai_flag_reviewed_by"?: string | null,"client_photo_id"?: string,"created_at"?: string,"device_taken_at"?: string | null,"id"?: string,"server_received_at"?: string,"sha256"?: string,"site_id"?: string,"step_record_id"?: string,"storage_path"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_ai_flag_reviewed_by_fkey"
      columns: ["ai_flag_reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_step_record_id_site_id_fkey"
      columns: ["step_record_id","site_id"]
isOneToOne: false
      referencedRelation: "step_records"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"preop_inspections": {
                  Row: {
                    "completed_at": string,"created_at": string,"id": string,"inspector_profile_id": string,"items": NonNullable<Json>,"result": Database["public"]['Enums']["inspection_result"],"shift_id": string,"site_id": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"created_at"?: string,"id"?: string,"inspector_profile_id": string,"items"?: NonNullable<Json>,"result": Database["public"]['Enums']["inspection_result"],"shift_id": string,"site_id": string,"zone_id": string
                  }
                  Update: {
                    "completed_at"?: string,"created_at"?: string,"id"?: string,"inspector_profile_id"?: string,"items"?: NonNullable<Json>,"result"?: Database["public"]['Enums']["inspection_result"],"shift_id"?: string,"site_id"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "preop_inspections_inspector_profile_id_fkey"
      columns: ["inspector_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "preop_inspections_shift_id_site_id_fkey"
      columns: ["shift_id","site_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "preop_inspections_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "preop_inspections_zone_id_site_id_fkey"
      columns: ["zone_id","site_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "auth_user_id": string | null,"consent_accepted_at": string | null,"created_at": string,"display_name": string,"id": string,"photo_url": string | null,"preferred_language": Database["public"]['Enums']["ui_language"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"consent_accepted_at"?: string | null,"created_at"?: string,"display_name": string,"id"?: string,"photo_url"?: string | null,"preferred_language"?: Database["public"]['Enums']["ui_language"],"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"consent_accepted_at"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"photo_url"?: string | null,"preferred_language"?: Database["public"]['Enums']["ui_language"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"releases": {
                  Row: {
                    "created_at": string,"decided_at": string,"decision": Database["public"]['Enums']["release_decision"],"id": string,"override_open_exceptions": boolean,"qa_profile_id": string,"reason": string | null,"shift_id": string,"site_id": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string,"decision": Database["public"]['Enums']["release_decision"],"id"?: string,"override_open_exceptions"?: boolean,"qa_profile_id": string,"reason"?: string | null,"shift_id": string,"site_id": string,"zone_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string,"decision"?: Database["public"]['Enums']["release_decision"],"id"?: string,"override_open_exceptions"?: boolean,"qa_profile_id"?: string,"reason"?: string | null,"shift_id"?: string,"site_id"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "releases_qa_profile_id_fkey"
      columns: ["qa_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "releases_shift_id_site_id_fkey"
      columns: ["shift_id","site_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "releases_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "releases_zone_id_site_id_fkey"
      columns: ["zone_id","site_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"shifts": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"shift_date": string,"site_id": string,"starts_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"shift_date": string,"site_id": string,"starts_at": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"shift_date"?: string,"site_id"?: string,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shifts_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"site_access": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"org_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"org_id": string,"site_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"org_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_access_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_access_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_access_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "address": string | null,"created_at": string,"id": string,"name": string,"org_id": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organisations"
      referencedColumns: ["id"]
    }
                  ]
                },"ssop_steps": {
                  Row: {
                    "atp_pass_max": number | null,"atp_required": boolean,"chemical_id": string | null,"created_at": string,"dilution": string | null,"dwell_minutes": number | null,"icon": string | null,"id": string,"instructions_en": string,"photo_required": boolean,"site_id": string,"ssop_id": string,"step_no": number,"step_type": Database["public"]['Enums']["step_type"],"title_en": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atp_pass_max"?: number | null,"atp_required"?: boolean,"chemical_id"?: string | null,"created_at"?: string,"dilution"?: string | null,"dwell_minutes"?: number | null,"icon"?: string | null,"id"?: string,"instructions_en"?: string,"photo_required"?: boolean,"site_id": string,"ssop_id": string,"step_no": number,"step_type": Database["public"]['Enums']["step_type"],"title_en": string,"updated_at"?: string
                  }
                  Update: {
                    "atp_pass_max"?: number | null,"atp_required"?: boolean,"chemical_id"?: string | null,"created_at"?: string,"dilution"?: string | null,"dwell_minutes"?: number | null,"icon"?: string | null,"id"?: string,"instructions_en"?: string,"photo_required"?: boolean,"site_id"?: string,"ssop_id"?: string,"step_no"?: number,"step_type"?: Database["public"]['Enums']["step_type"],"title_en"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ssop_steps_chemical_id_site_id_fkey"
      columns: ["chemical_id","site_id"]
isOneToOne: false
      referencedRelation: "chemicals"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "ssop_steps_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ssop_steps_ssop_id_site_id_fkey"
      columns: ["ssop_id","site_id"]
isOneToOne: false
      referencedRelation: "ssops"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"ssops": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"equipment_id": string,"id": string,"site_id": string,"status": Database["public"]['Enums']["ssop_status"],"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"equipment_id": string,"id"?: string,"site_id": string,"status"?: Database["public"]['Enums']["ssop_status"],"updated_at"?: string,"version": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"equipment_id"?: string,"id"?: string,"site_id"?: string,"status"?: Database["public"]['Enums']["ssop_status"],"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ssops_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ssops_equipment_id_site_id_fkey"
      columns: ["equipment_id","site_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "ssops_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"step_records": {
                  Row: {
                    "atp_value": number | null,"chain_hash": string | null,"client_record_id": string,"created_at": string,"device_completed_at": string | null,"device_id": string | null,"device_started_at": string | null,"id": string,"note_language": string | null,"note_original": string | null,"payload_hash": string,"profile_id": string,"result": Database["public"]['Enums']["step_result"],"server_received_at": string,"site_id": string,"skip_reason": string | null,"ssop_step_id": string,"supersedes_id": string | null,"task_id": string,"timer_ended_at": string | null,"timer_started_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atp_value"?: number | null,"chain_hash"?: string | null,"client_record_id": string,"created_at"?: string,"device_completed_at"?: string | null,"device_id"?: string | null,"device_started_at"?: string | null,"id"?: string,"note_language"?: string | null,"note_original"?: string | null,"payload_hash": string,"profile_id": string,"result": Database["public"]['Enums']["step_result"],"server_received_at"?: string,"site_id": string,"skip_reason"?: string | null,"ssop_step_id": string,"supersedes_id"?: string | null,"task_id": string,"timer_ended_at"?: string | null,"timer_started_at"?: string | null
                  }
                  Update: {
                    "atp_value"?: number | null,"chain_hash"?: string | null,"client_record_id"?: string,"created_at"?: string,"device_completed_at"?: string | null,"device_id"?: string | null,"device_started_at"?: string | null,"id"?: string,"note_language"?: string | null,"note_original"?: string | null,"payload_hash"?: string,"profile_id"?: string,"result"?: Database["public"]['Enums']["step_result"],"server_received_at"?: string,"site_id"?: string,"skip_reason"?: string | null,"ssop_step_id"?: string,"supersedes_id"?: string | null,"task_id"?: string,"timer_ended_at"?: string | null,"timer_started_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "step_records_device_id_site_id_fkey"
      columns: ["device_id","site_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "step_records_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "step_records_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "step_records_ssop_step_id_site_id_fkey"
      columns: ["ssop_step_id","site_id"]
isOneToOne: false
      referencedRelation: "ssop_steps"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "step_records_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "step_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "step_records_task_id_site_id_fkey"
      columns: ["task_id","site_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assigned_profile_id": string | null,"created_at": string,"equipment_id": string,"id": string,"reclean_of_task_id": string | null,"shift_id": string,"site_id": string,"ssop_id": string,"status": Database["public"]['Enums']["task_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_profile_id"?: string | null,"created_at"?: string,"equipment_id": string,"id"?: string,"reclean_of_task_id"?: string | null,"shift_id": string,"site_id": string,"ssop_id": string,"status"?: Database["public"]['Enums']["task_status"],"updated_at"?: string
                  }
                  Update: {
                    "assigned_profile_id"?: string | null,"created_at"?: string,"equipment_id"?: string,"id"?: string,"reclean_of_task_id"?: string | null,"shift_id"?: string,"site_id"?: string,"ssop_id"?: string,"status"?: Database["public"]['Enums']["task_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assigned_profile_id_fkey"
      columns: ["assigned_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_equipment_id_site_id_fkey"
      columns: ["equipment_id","site_id"]
isOneToOne: false
      referencedRelation: "equipment"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "tasks_reclean_of_task_id_fkey"
      columns: ["reclean_of_task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_shift_id_site_id_fkey"
      columns: ["shift_id","site_id"]
isOneToOne: false
      referencedRelation: "shifts"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "tasks_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_ssop_id_site_id_fkey"
      columns: ["ssop_id","site_id"]
isOneToOne: false
      referencedRelation: "ssops"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"zones": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"risk_level": Database["public"]['Enums']["risk_level"],"site_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"risk_level"?: Database["public"]['Enums']["risk_level"],"site_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"risk_level"?: Database["public"]['Enums']["risk_level"],"site_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zones_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "device_cleaners":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"has_consented": boolean,"photo_url": string,"preferred_language": Database["public"]['Enums']["ui_language"],"profile_id": string
            }[]
                           },
"reset_demo_data":
{ Args: Record<PropertyKey, never>; Returns: {
              "auth_user_id": string
            }[]
                           },
"set_cleaner_pin":
{ Args: { "p_pin": string,"p_profile_id": string }; Returns: undefined
                           },
"verify_chain":
{ Args: { "p_from"?: string,"p_site_id": string,"p_to"?: string }; Returns: {
              "breaks": number,"first_break_seq": number,"records": number,"verified": boolean
            }[]
                           },
"verify_cleaner_pin":
{ Args: { "p_pin": string,"p_profile_id": string }; Returns: boolean
                           }
          }
          Enums: {
            "chemical_type": "alkaline"|"acid"|"chlorinated"|"sanitiser"|"other","exception_severity": "red"|"amber","exception_status": "open"|"resolved","exception_type": "missed_step"|"dwell_short"|"atp_fail"|"reclean"|"photo_flag"|"clock_skew"|"late_sync","inspection_result": "pass"|"fail","member_role": "cleaner"|"supervisor"|"qa"|"site_admin"|"contractor_admin","org_type": "processor"|"contractor","release_decision": "released"|"held","risk_level": "high"|"medium"|"low","ssop_status": "draft"|"active"|"retired","step_result": "done"|"skipped"|"failed","step_type": "prepare_isolate"|"dry_clean"|"pre_rinse"|"foam"|"dwell"|"scrub"|"rinse"|"inspect"|"sanitise"|"atp_check"|"reassemble","task_status": "pending"|"in_progress"|"completed"|"reclean_required"|"verified","translation_source": "ai"|"human","ui_language": "en"|"tl"|"id"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "chemical_type": ["alkaline", "acid", "chlorinated", "sanitiser", "other"],"exception_severity": ["red", "amber"],"exception_status": ["open", "resolved"],"exception_type": ["missed_step", "dwell_short", "atp_fail", "reclean", "photo_flag", "clock_skew", "late_sync"],"inspection_result": ["pass", "fail"],"member_role": ["cleaner", "supervisor", "qa", "site_admin", "contractor_admin"],"org_type": ["processor", "contractor"],"release_decision": ["released", "held"],"risk_level": ["high", "medium", "low"],"ssop_status": ["draft", "active", "retired"],"step_result": ["done", "skipped", "failed"],"step_type": ["prepare_isolate", "dry_clean", "pre_rinse", "foam", "dwell", "scrub", "rinse", "inspect", "sanitise", "atp_check", "reassemble"],"task_status": ["pending", "in_progress", "completed", "reclean_required", "verified"],"translation_source": ["ai", "human"],"ui_language": ["en", "tl", "id"]
          }
        }
} as const
