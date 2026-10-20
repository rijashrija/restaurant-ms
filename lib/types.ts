export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  is_available: boolean;
}

export interface Table {
  id: number;
  table_number: number;
  qr_identifier: string;
  status: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Order {
  id: number;
  table_id: number;
  table_number: number;
  status: 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
  placed_by_username?: string | null;
  order_count?: number;
  total_price?: number;
  servers_list?: string | null;
  all_staff?: string[];
}

export interface OrderDetailItem {
  id: number;
  menu_item_id: number;
  quantity: number;
  price: number;
  item_name: string;
  round_number?: number;
  item_created_at?: string;
  total?: number;
  served_by_user_id?: number | null;
  served_by_username?: string | null;
}

export interface OrderRound {
  round_number: number;
  ordered_at: string;
  items: OrderDetailItem[];
  subtotal: number;
  served_by_username?: string | null;
  served_by_usernames?: string[];
}

export interface OrderDetails extends Order {
  total_price: number;
  order_count: number;
  rounds: OrderRound[];
  items: OrderDetailItem[];
}

export interface StaffUser {
  id: number;
  username: string;
  role: string;
}
