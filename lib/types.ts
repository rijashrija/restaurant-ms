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
}

export interface OrderDetailItem {
  id: number;
  menu_item_id: number;
  quantity: number;
  price: number;
  item_name: string;
}

export interface OrderDetails extends Order {
  total_price: number;
  items: OrderDetailItem[];
}
