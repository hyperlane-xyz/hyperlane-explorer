import { DEFAULT_GITHUB_REGISTRY } from '@hyperlane-xyz/registry';
import {
  ChainMetadataSchema,
  mergeChainMetadataMap,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { tryParseJsonOrYaml } from '@hyperlane-xyz/utils';
import { Modal } from '@hyperlane-xyz/widgets/layout/Modal';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

import { ChainLogo } from '../../components/icons/ChainLogo';
import { useChainMetadataMap, useChainMetadataResolver, useStore } from '../../metadataStore';
import { useScrapedChains } from './queries/useScrapedChains';

const PLACEHOLDER_TEXT = `# YAML data
---
chainId: 11155111
name: sepolia
displayName: Sepolia
protocol: ethereum
rpcUrls:
  - http: https://foobar.com
blockExplorers:
  - name: Sepolia Etherscan
    family: etherscan
    url: https://sepolia.etherscan.io
    apiUrl: https://api-sepolia.etherscan.io/api
    apiKey: '12345'
blocks:
  confirmations: 1
  estimateBlockTime: 13
`;

export function ChainSearchModal({
  isOpen,
  close,
  onClickChain,
  showAddChainMenu,
}: {
  isOpen: boolean;
  close: () => void;
  onClickChain?: (metadata: ChainMetadata) => void;
  showAddChainMenu?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [isAddingChain, setIsAddingChain] = useState(!!showAddChainMenu);
  const chainMetadataResolver = useChainMetadataResolver();
  const chainMetadata = useChainMetadataMap();
  const { chains } = useScrapedChains(chainMetadataResolver);
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides);
  const setChainMetadataOverrides = useStore((s) => s.setChainMetadataOverrides);

  const mergedChainMetadata = useMemo(
    () => mergeChainMetadataMap(chains, chainMetadataOverrides),
    [chains, chainMetadataOverrides],
  );
  const allChainMetadata = useMemo(
    () => mergeChainMetadataMap(chainMetadata, chainMetadataOverrides),
    [chainMetadata, chainMetadataOverrides],
  );

  const visibleChains = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return Object.values(mergedChainMetadata)
      .filter((metadata) => {
        if (!normalizedQuery) return true;
        return (
          metadata.name.toLowerCase().includes(normalizedQuery) ||
          metadata.displayName?.toLowerCase().includes(normalizedQuery) ||
          metadata.chainId?.toString().toLowerCase().includes(normalizedQuery) ||
          metadata.domainId?.toString().toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const aLabel = a.displayName || a.name;
        const bLabel = b.displayName || b.name;
        return aLabel.localeCompare(bLabel);
      });
  }, [mergedChainMetadata, query]);

  useEffect(() => {
    if (showAddChainMenu === undefined) return;
    setIsAddingChain(showAddChainMenu);
  }, [showAddChainMenu]);

  const handleSelectChain = (metadata: ChainMetadata) => {
    onClickChain?.(metadata);
    close();
  };

  return (
    <Modal
      isOpen={isOpen}
      close={close}
      panelClassname="p-4 sm:p-5 max-w-2xl min-h-[50vh] max-h-[85vh] overflow-x-hidden"
    >
      {isAddingChain ? (
        <AddChainForm
          allChainMetadata={allChainMetadata}
          onBack={() => setIsAddingChain(false)}
          onChangeOverrideMetadata={setChainMetadataOverrides}
          overrideChainMetadata={chainMetadataOverrides}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search chains by name, display name, chain ID, or domain ID"
              placeholder="Chain name or ID"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-gray-400"
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              onClick={() => setIsAddingChain(true)}
            >
              Add chain
            </button>
          </div>

          <div className="max-h-[62vh] overflow-y-auto overflow-x-hidden">
            {visibleChains.length ? (
              <div className="flex flex-col divide-y divide-gray-100">
                {visibleChains.map((metadata) => (
                  <button
                    key={metadata.name}
                    type="button"
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-gray-50"
                    onClick={() => handleSelectChain(metadata)}
                  >
                    <ChainLogo chainName={metadata.name} size={28} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-primary-900">
                        {metadata.displayName || metadata.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {metadata.isTestnet ? 'Testnet' : 'Mainnet'}
                        {' · '}
                        {metadata.name}
                        {' · '}
                        {metadata.chainId}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-gray-500">No chains found</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddChainForm({
  allChainMetadata,
  overrideChainMetadata,
  onChangeOverrideMetadata,
  onBack,
}: {
  allChainMetadata: Record<string, ChainMetadata>;
  overrideChainMetadata: Record<string, Partial<ChainMetadata>>;
  onChangeOverrideMetadata: (
    overrides?: Record<string, Partial<ChainMetadata> | undefined>,
  ) => Promise<void>;
  onBack: () => void;
}) {
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onChangeInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(event.target.value);
    setError(null);
  };

  const onClickAdd = async () => {
    const parsed = tryParseChainMetadata(textInput, allChainMetadata, overrideChainMetadata);
    if (!parsed.success) {
      setError(parsed.error);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onChangeOverrideMetadata({
        ...overrideChainMetadata,
        [parsed.data.name]: parsed.data,
      });
      setTextInput('');
      onBack();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save chain metadata');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="w-fit text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
        onClick={onBack}
      >
        Back
      </button>
      <div>
        <h2 className="text-lg font-medium text-primary-900">Add chain metadata</h2>
        <p className="mt-1 text-sm text-gray-500">
          Add metadata for chains not yet included in the{' '}
          <a
            href={DEFAULT_GITHUB_REGISTRY}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Hyperlane Canonical Registry
          </a>
          . This only affects your local browser session.
        </p>
      </div>
      <textarea
        className="min-h-72 w-full rounded-lg border border-gray-200 p-3 font-mono text-xs outline-none transition-colors focus:border-gray-400"
        aria-label="Chain metadata YAML or JSON"
        placeholder={PLACEHOLDER_TEXT}
        value={textInput}
        onChange={onChangeInput}
      />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={isSaving}
          className="rounded-full bg-accent-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-800 disabled:bg-gray-300 disabled:text-gray-500"
          onClick={() => void onClickAdd()}
        >
          Add chain
        </button>
      </div>
    </div>
  );
}

function tryParseChainMetadata(
  input: string,
  allChainMetadata: Record<string, ChainMetadata>,
  overrideChainMetadata: Record<string, Partial<ChainMetadata>>,
): { success: true; data: ChainMetadata } | { success: false; error: string } {
  const parsed = tryParseJsonOrYaml(input);
  if (!parsed.success) return { success: false, error: String(parsed.error) };

  const result = ChainMetadataSchema.safeParse(parsed.data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `${firstIssue.path.join('.')} => ${firstIssue.message}`,
    };
  }

  const metadata = result.data;
  const chainId = metadata.chainId;
  const effectiveDomainId = getEffectiveDomainId(metadata);
  const hasExistingOverride = !!overrideChainMetadata[metadata.name];
  if (allChainMetadata[metadata.name] && !hasExistingOverride) {
    return { success: false, error: 'name is already in use by another chain' };
  }

  if (
    chainId !== undefined &&
    Object.entries(allChainMetadata).some(
      ([chainName, chain]) =>
        chainName !== metadata.name && areChainIdsEqual(chain.chainId, chainId),
    )
  ) {
    return { success: false, error: 'chainId is already in use by another chain' };
  }

  if (
    effectiveDomainId !== null &&
    Object.entries(allChainMetadata).some(
      ([chainName, chain]) =>
        chainName !== metadata.name && getEffectiveDomainId(chain) === effectiveDomainId,
    )
  ) {
    return { success: false, error: 'domainId is already in use by another chain' };
  }

  return { success: true, data: metadata };
}

function areChainIdsEqual(
  left: ChainMetadata['chainId'],
  right: ChainMetadata['chainId'],
): boolean {
  if (left === undefined || left === null || right === undefined || right === null) {
    return false;
  }

  if (left === right) return true;

  const leftNumeric = tryNormalizeNumericChainId(left);
  const rightNumeric = tryNormalizeNumericChainId(right);
  return leftNumeric !== null && leftNumeric === rightNumeric;
}

function getEffectiveDomainId(metadata: Pick<ChainMetadata, 'chainId' | 'domainId'>) {
  if (metadata.domainId !== undefined && metadata.domainId !== null) {
    return metadata.domainId;
  }

  return tryNormalizeNumericChainId(metadata.chainId);
}

function tryNormalizeNumericChainId(chainId: ChainMetadata['chainId']): number | null {
  if (typeof chainId === 'number') {
    return Number.isSafeInteger(chainId) ? chainId : null;
  }

  if (typeof chainId !== 'string' || !/^\d+$/.test(chainId)) return null;

  const numericChainId = Number(chainId);
  if (!Number.isSafeInteger(numericChainId)) return null;
  if (String(numericChainId) !== chainId) return null;

  return numericChainId;
}
