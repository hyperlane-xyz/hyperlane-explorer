export function InfoBanner() {
  return (
    <a
      href="https://explorer-v2.hyperlane.xyz"
      target="_blank"
      rel="noopener noreferrer"
      className="bg-primary-600 hover:bg-primary-700 active:bg-primary-800 block w-full py-1.5 text-center text-sm text-white transition-all duration-300"
    >
      This is the explorer for Hyperlane version 3.{' '}
      <span className="underline underline-offset-2">Use version 2</span>
    </a>
  );
}
