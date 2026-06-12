export interface Member {
  id: string;
  user_id: string;
  display_name: string;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  members: Member[];
  my_member_id: string;
}

export interface Payment {
  id: string;
  payer_member_id: string;
  amount: number;
  category: string;
  paid_at: string; // YYYY-MM-DD
  created_at: string;
}

export interface MemberTotal {
  member_id: string;
  display_name: string;
  total: number;
}

export interface Summary {
  totals: MemberTotal[];
  grand_total: number;
  difference: number;
  settlement_amount: number;
  from_member_id: string | null;
  to_member_id: string | null;
  message: string;
}

export interface CelebrationSettings {
  celebration_enabled: boolean;
  celebration_image_url: string | null;
}
