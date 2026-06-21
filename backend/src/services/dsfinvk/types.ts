export interface DsfinvkOrder {
  id: string;
  orderNumber?: any;
  status?: string;
  paymentMethod?: string;
  totalAmount?: any;
  deliveryFee?: any;
  currency?: string;
  createdAt?: any;
  postedAt?: any;
  orderItems?: DsfinvkOrderItem[];
  fiscalTransaction?: {
    status?: string;
    signaturePayload?: any;
    errorMessage?: string;
  } | null;
  discountAmount?: any;
  discountType?: string | null;
  discountValue?: any;
  takeawayServiceFee?: any;
  takeawayServiceTaxAmount?: any;
  takeawayServiceTaxPercentage?: any;
  voucherPaymentAmount?: any;
  voucherCodes?: string[];
}

export interface DsfinvkOrderItem {
  id?: string;
  itemType?: string;
  quantity?: any;
  unitPrice?: any;
  totalPrice?: any;
  taxPercentage?: any;
  selectedSize?: string;
  parentDealItemId?: string | null;
  meal?: {
    name?: string;
    sku?: string;
    id?: string;
    category?: { id?: string; name?: string };
  } | null;
  deal?: { name?: string; sku?: string } | null;
  dealComponent?: { name?: string } | null;
  orderItemAddOns?: DsfinvkOrderItemAddOn[];
  itemDiscountAmount?: any;
  itemDiscountType?: string | null;
  itemSurchargeAmount?: any;
  _bundleText?: string;
  _bundleStandalonePrice?: number;
}

export interface DsfinvkOrderItemAddOn {
  addOnName?: string;
  addOnPrice?: any;
  taxAmount?: any;
  taxPercentage?: any;
  quantity?: any;
  addon_id?: string;
  addon?: { sku?: string } | null;
}

export interface DsfinvkCorrection {
  id: string;
  orderId?: string | null;
  refundId?: string | null;
  type?: string;
  amount?: any;
  currency?: string;
  signaturePayload?: any;
  errorMessage?: string;
  createdAt?: any;
}

export interface DsfinvkPosDevice {
  id: string;
  name?: string;
  deviceCode?: string;
  fiskalyClientId?: string;
  fiskalyClientSerialNumber?: string;
}

export interface DsfinvkBuilderContext {
  organizationId: string;
  cashRegisterId: string;
  cashRegisterExportId: string;
  cashPointClosingExportNumber: number;
  exportCreationDate: number;
  businessDate: string;
  orders: DsfinvkOrder[];
  corrections: DsfinvkCorrection[];
  posDevices: DsfinvkPosDevice[];
  settings?: {
    fiscalName?: string | null;
    taxNumber?: string | null;
    vatId?: string | null;
  } | null;
}

export interface VatBucket {
  vat_id: string;
  vat_rate: number;
  excl_vat: number;
  vat: number;
  incl_vat: number;
}

export interface AmountPerVatId {
  vat_definition_export_id: number;
  excl_vat: number;
  vat: number;
  incl_vat: number;
}

export interface ItemAmountRow {
  typ: "base_amount" | "discount" | "extra_amount";
  ust_schluessel: number;
  pf_brutto: number;
  pf_netto: number;
  pf_ust: number;
}

export interface SubItem {
  number: string;
  name: string;
  quantity: number;
  quantity_factor: number;
  quantity_measure: string;
  price_per_unit: number;
  amount_per_vat_id: AmountPerVatId;
}

// Discount sub-item structure for Mehr-Mindererloese (price adjustments)
export interface DiscountSubItem {
  sub_item_export_id: string;
  text: string;
  line_item_amount_excl_vat: number;
  line_item_amount_incl_vat: number;
  amount_excl_vat?: number;
  amount_incl_vat?: number;
  business_case: {
    type: string;
    name: string;
    amounts_per_vat_id: AmountPerVatId[];
  };
  item: {
    number: string;
    quantity: number;
    price_per_unit: number;
  };
}

export interface OrderLine {
  lineitem_export_id: string;
  text: string;
  storno: boolean;
  line_item_amount_excl_vat?: number;
  line_item_amount_incl_vat?: number;
  amount_excl_vat?: number;
  amount_incl_vat?: number;
  voucher_id?: string;

  business_case: {
    type: string;
    name: string;
    amounts_per_vat_id: AmountPerVatId[];
  };

  item: {
    number: string;
    quantity: number;
    price_per_unit: number;
  };

  sub_items?: (SubItem | DiscountSubItem)[];
}

export interface TransactionReference {
  type: "InterneTransaktion";
  tx_id: string;
}

export interface TransactionPayment {
  type: string;           // was zahlart_typ
  name: string;           // was zahlart_name
  currency_code: string;  // was zahlwaeh_code
  amount: number;         // was zahlwaeh_betrag
  voucher_id?: string;
}

export interface TransactionRow {
  head: {
    tx_id: string;
    transaction_export_id: string;
    closing_client_id: string;
    type: string;
    storno: boolean;
    number: number;
    timestamp_start: number;
    timestamp_end: number;
    allocation_groups: string[];
    references?: TransactionReference[];
  };
  data: {
    full_amount_incl_vat: number;
    amounts_per_vat_id: AmountPerVatId[];
    lines: OrderLine[];
    payment_types: TransactionPayment[];
    references?: TransactionReference[];
  };
  security: { tss_tx_id: string } | { error_message: string };
}

export interface PaymentType {
  type: string;
  name: string;
  currency_code: string;
  amount: number;
}

export interface CashStatementPayment {
  full_amount: number;
  cash_amount: number;
  cash_amounts_by_currency: Array<{ currency_code: string; amount: number }>;
  payment_types: PaymentType[];
}

export interface SlaveRow {
  terminal_id: string;
  terminal_brand: string;
  terminal_modell: string;
  terminal_seriennr: string;
  terminal_sw_brand: string;
  terminal_sw_version: string;
}

export interface BusinessCaseRow {
  type: string;
  amounts_per_vat_id: Array<{
    vat_definition_export_id: number;
    excl_vat: number;
    vat: number;
    incl_vat: number;
  }>;
}

export interface CashPointClosingPayload {
  head: {
    export_creation_date: number;
    business_date: string;
    first_transaction_export_id: string;
    last_transaction_export_id: string;
  };
  cash_statement: {
    business_cases: BusinessCaseRow[];
    payment: CashStatementPayment;
  };
  transactions: TransactionRow[];
}
