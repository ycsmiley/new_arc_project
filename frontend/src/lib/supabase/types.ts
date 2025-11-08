export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          type: "BUYER" | "SUPPLIER";
          wallet_address: string | null;
          credit_rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: "BUYER" | "SUPPLIER";
          wallet_address?: string | null;
          credit_rating?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: "BUYER" | "SUPPLIER";
          wallet_address?: string | null;
          credit_rating?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          invoice_number: string;
          amount: number;
          currency: string;
          due_date: string;
          supplier_id: string | null;
          buyer_id: string | null;
          supplier_address: string | null;
          buyer_address: string | null;
          pdf_url: string | null;
          metadata: Json | null;
          status: "PENDING" | "APPROVED" | "FINANCED" | "REJECTED" | "PAID" | "REPAID";
          aegis_payout_offer: number | null;
          aegis_repayment_amount: number | null;
          aegis_discount_rate: number | null;
          aegis_risk_score: number | null;
          aegis_ai_risk_score: number | null;
          aegis_pricing_explanation: string | null;
          aegis_signature: string | null;
          aegis_nonce: number | null;
          aegis_deadline: number | null;
          aegis_due_date: number | null;
          financing_tx_hash: string | null;
          repayment_tx_hash: string | null;
          blockchain_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          invoice_number: string;
          amount: number;
          currency?: string;
          due_date: string;
          supplier_id?: string | null;
          buyer_id?: string | null;
          supplier_address?: string | null;
          buyer_address?: string | null;
          pdf_url?: string | null;
          metadata?: Json | null;
          status?: "PENDING" | "APPROVED" | "FINANCED" | "REJECTED" | "PAID" | "REPAID";
          aegis_payout_offer?: number | null;
          aegis_repayment_amount?: number | null;
          aegis_discount_rate?: number | null;
          aegis_risk_score?: number | null;
          aegis_ai_risk_score?: number | null;
          aegis_pricing_explanation?: string | null;
          aegis_signature?: string | null;
          aegis_nonce?: number | null;
          aegis_deadline?: number | null;
          aegis_due_date?: number | null;
          financing_tx_hash?: string | null;
          repayment_tx_hash?: string | null;
          blockchain_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invoice_number?: string;
          amount?: number;
          currency?: string;
          due_date?: string;
          supplier_id?: string | null;
          buyer_id?: string | null;
          supplier_address?: string | null;
          buyer_address?: string | null;
          pdf_url?: string | null;
          metadata?: Json | null;
          status?: "PENDING" | "APPROVED" | "FINANCED" | "REJECTED" | "PAID" | "REPAID";
          aegis_payout_offer?: number | null;
          aegis_repayment_amount?: number | null;
          aegis_discount_rate?: number | null;
          aegis_risk_score?: number | null;
          aegis_ai_risk_score?: number | null;
          aegis_pricing_explanation?: string | null;
          aegis_signature?: string | null;
          aegis_nonce?: number | null;
          aegis_deadline?: number | null;
          aegis_due_date?: number | null;
          financing_tx_hash?: string | null;
          repayment_tx_hash?: string | null;
          blockchain_confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_profiles: {
        Row: {
          id: string;
          email: string;
          role: "BUYER" | "SUPPLIER" | "ADMIN" | "LP";
          company_id: string | null;
          wallet_address: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role: "BUYER" | "SUPPLIER" | "ADMIN" | "LP";
          company_id?: string | null;
          wallet_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "BUYER" | "SUPPLIER" | "ADMIN" | "LP";
          company_id?: string | null;
          wallet_address?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

