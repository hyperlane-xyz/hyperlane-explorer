declare type Address = string;
declare type HexString = string;
declare type ChainId = number | string;
declare type DomainId = number;
declare type AddressTo<T> = Record<Address, T>;
declare type Fn = () => void;

declare module '*.css' {
  const content: string;
  export default content;
}
