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

// 精算の種別: warikan=2人で折半 / tatekae=相手が全額負担(立て替え/貸し)
export type SplitType = "warikan" | "tatekae";

export interface Payment {
  id: string;
  payer_member_id: string;
  amount: number;
  category: string;
  paid_at: string; // YYYY-MM-DD
  split_type: SplitType;
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

export interface CelebrationImage {
  id: string;
  url: string;
}

export interface CelebrationSettings {
  celebration_enabled: boolean;
  images: CelebrationImage[];
}

export interface Message {
  id: string;
  sender_member_id: string;
  body: string;
  created_at: string;
}
