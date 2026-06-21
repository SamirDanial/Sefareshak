declare module "@paypal/checkout-server-sdk" {
  export namespace core {
    export class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    export class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    export class PayPalHttpClient {
      constructor(environment: SandboxEnvironment | LiveEnvironment);
      execute<T = any>(request: any): Promise<{ result: T }>;
    }
  }

  export namespace orders {
    export class OrdersCreateRequest {
      prefer(value: string): void;
      requestBody(body: any): void;
    }
    export class OrdersCaptureRequest {
      constructor(orderId: string);
      requestBody(body: any): void;
    }
  }

  export interface PayPalOrder {
    id: string;
    status: string;
    intent?: string;
    purchase_units?: Array<{
      amount: {
        currency_code: string;
        value: string;
      };
    }>;
  }

  export interface PayPalCapture {
    id: string;
    status: string;
    payer?: {
      email_address?: string;
      name?: {
        given_name?: string;
        surname?: string;
      };
    };
    amount?: {
      currency_code: string;
      value: string;
    };
  }
}

