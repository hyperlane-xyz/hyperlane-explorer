export function InfoBanner() {
  return (
    <a
      href="https://explorer-v1.hyperlane.xyz"
      target="_blank"
      rel="noopener noreferrer"
      className="block py-1.5 w-full text-white text-center text-sm bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ring-1 ring-inset ring-green-700 transition-all duration-300"
    >
      This is the Explorer for Hyperlane version 2.{' '}
      <span className="underline underline-offset-2">Use version 1</span>
    </a>
  );
}
