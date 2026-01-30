## Frontend Security Focus Areas

This is a Web3 frontend application. Pay special attention to:

### XSS & Content Security
- Input sanitization before rendering user data
- Dangerous patterns: dangerouslySetInnerHTML, eval(), innerHTML
- URL validation (javascript: protocol, data: URLs)
- CSP headers and inline script risks

### Web3 Wallet Security
- Blind signature attacks (signing data without user understanding)
- Transaction simulation before signing
- Clear message display before signature requests
- Proper origin/domain verification for wallet connections

### Dependency & Supply Chain
- Known vulnerabilities in dependencies
- Malicious packages, typosquatting
- Outdated critical security packages

### API & Token Security
- CORS configuration
- Token storage (avoid localStorage for sensitive tokens)
- API key exposure in client-side code

### Private Key Handling
- NEVER expose private keys client-side
- Check for hardcoded keys or mnemonics
- Wallet connection patterns should not request keys

### Edge Runtime Restrictions
- API routes using edge runtime cannot import full SDK packages
- Avoid @hyperlane-xyz/utils in edge functions
- Use minimal, self-contained implementations for edge routes
