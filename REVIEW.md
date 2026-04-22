# Code Review Guidelines

## Code Quality

- Logic errors and potential bugs
- Error handling and edge cases
- Code clarity and maintainability
- Prefer consistent hook ordering in components: state/context/store hooks and plain vars first, then memos, then functions/useCallbacks, then effects
- Prefer rendering JSX inline or extracting a small component over storing component-like JSX in local variables
- Prefer function components/hooks over class components unless the React API still requires a class (for example local error boundaries)
- Move stable event handlers/helpers outside `useEffect` bodies when they don't need effect-local scope
- Extract repeated scheduling/fallback wrappers into a shared util instead of copying the same browser async pattern across files
- Adherence to existing patterns in the codebase
- **Use existing utilities** - Search codebase before adding new helpers
- **Prefer `??` over `||`** - Preserves zero/empty string as valid values
- **No async IIFEs** - Use `.then().catch()` instead of `void (async () => { ... })()` (in `useEffect`, named inner async funcs are fine: `const load = async () => { ... }; load();`; anonymous async IIFEs still disallowed)

## Architecture

- Consistency with existing architecture patterns
- Breaking changes or backward compatibility issues
- API contract changes
- Preserve intentional metadata-only vs provider-backed boundaries; don't collapse `metadataStore.ts` back into `store.ts` unless there is a concrete functional need
- **Deduplicate** - Move repeated code/types to shared files
- **Extract utilities** - Shared functions belong in utils packages
- **Prefer shared widgets surfaces** - If behavior belongs in widgets, upstream/fix the shared component instead of growing Explorer-only clones
- **Narrow runtime surfaces without dropping parity** - Keep supported protocol behavior; if a broad import is the problem, prefer a narrower runtime subpath over removing support
- **Keep last-known-good provider state** - During async provider rebuilds, avoid eagerly swapping to empty placeholders if the old provider can safely remain live until replacement

## Testing

- Test coverage for new/modified code
- Edge cases that should be tested
- **New utility functions need unit tests**

## Performance

- Unnecessary re-renders or computations
- Bundle size impact of new dependencies

## Explorer-Specific

- **Use existing utilities** - Check `src/utils/` (formatAmountCompact, shortenAddress, tryGetBlockExplorerAddressUrl)
- **Query limits** - Use SEARCH_QUERY_LIMIT for searches, larger batches for background ops
- **Deduplicate** - Move repeated constants/types to `src/consts/` or `src/types.ts`
- **URL state sync** - Search filters should sync with URL query params
- **PI chains** - Permissionless Interop chains have separate query paths in `src/features/messages/pi-queries/`
- **Edge runtime** - Can't import @hyperlane-xyz/utils in edge runtime (API routes)
- **Export reusable components** - Common UI patterns should be extracted
- **Provider-backed queries need readiness + versioning** - If queries depend on the runtime provider, gate them on the ready provider and include provider version in the query key
- **Avoid alloc-heavy store selectors** - Prefer individual Zustand selectors or shallow-equal slices over returning fresh objects each render
- **Use shared chain menu behavior** - Chain search/filter/sort/add/edit behavior should stay aligned with widgets unless Explorer has a real product-specific divergence

## UI Consistency

- **Color consistency** - Don't mix multiple shades; use design system colors
- **Green = success at destination** - Not origin; use blue/neutral for origin
- **Avoid wasted space** - Keep layouts compact and information-dense
- **Collapsible for detail** - Use collapsible sections for verbose content
