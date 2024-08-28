export const DOMAINS_QUERY = `
query @cached {
  domain {
    id
    native_token
    name
    is_test_net
    is_deprecated
    chain_id
  }
}
`;

export interface DomainsEntry {
  id: number; // domainId
  native_token: string;
  name: string;
  is_test_net: boolean;
  is_deprecated: boolean;
  chain_id: string | number;
}
