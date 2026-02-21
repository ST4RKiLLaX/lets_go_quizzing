#!/usr/bin/env node
/**
 * Generates an SPDX 2.3 Software Bill of Materials (SBOM) from package-lock.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.join(__dirname, '..', 'package-lock.json');
const pkgPath = path.join(__dirname, '..', 'package.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const packages = lock.packages || {};
const seen = new Map();

for (const [pkgPathKey, pkgData] of Object.entries(packages)) {
  if (!pkgPathKey || !pkgData.version) continue;
  const pathParts = pkgPathKey.replace(/^node_modules\//, '').split('/');
  const name = pkgData.name || (pathParts[0]?.startsWith('@') ? pathParts.slice(0, 2).join('/') : pathParts[0]) || pkgPathKey;
  const key = `${name}@${pkgData.version}`;
  if (!seen.has(key)) {
    seen.set(key, {
      name,
      version: pkgData.version,
      resolved: pkgData.resolved || null,
      integrity: pkgData.integrity || null,
      license: pkgData.license || null,
      dev: !!pkgData.dev,
      optional: !!pkgData.optional,
    });
  }
}

const deps = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));

function spdxId(name, version) {
  return `SPDXRef-Package-${name.replace(/[@/]/g, '_')}-${version}`;
}

const now = new Date().toISOString();
const docNamespace = `https://spdx.org/spdxdocs/lets-go-quizzing-${pkg.version}-${Date.now()}`;

const sbom = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `lets-go-quizzing-${pkg.version}-sbom`,
  documentNamespace: docNamespace,
  creationInfo: {
    created: now,
    creators: ['Tool: generate-sbom.js', `Organization: ${pkg.name}`],
  },
  packages: [
    {
      SPDXID: 'SPDXRef-Root',
      name: pkg.name,
      versionInfo: pkg.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      description: pkg.description || 'Quiz application',
    },
    ...deps.map((d) => {
      const alg = d.integrity?.startsWith('sha512-') ? 'SHA512' : d.integrity?.startsWith('sha384-') ? 'SHA384' : d.integrity?.startsWith('sha256-') ? 'SHA256' : null;
      const checksum = d.integrity?.includes('-') ? d.integrity.split('-')[1] : null;
      const purl = `pkg:npm/${encodeURIComponent(d.name)}@${d.version}`;
      return {
        SPDXID: spdxId(d.name, d.version),
        name: d.name,
        versionInfo: d.version,
        downloadLocation: d.resolved || 'NOASSERTION',
        filesAnalyzed: false,
        licenseConcluded: d.license || 'NOASSERTION',
        licenseDeclared: d.license || 'NOASSERTION',
        copyrightText: 'NOASSERTION',
        ...(alg && checksum && { checksums: [{ algorithm: alg, checksumValue: checksum }] }),
        externalRefs: [
          { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: purl },
        ],
        ...((d.optional || d.dev) && {
          comment: [d.optional && 'Optional', d.dev && 'Dev'].filter(Boolean).join(', ') + ' dependency',
        }),
      };
    }),
  ],
  relationships: [
    ...deps.map((d) => ({
      spdxElementId: 'SPDXRef-Root',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: spdxId(d.name, d.version),
    })),
  ],
};

const outPath = path.join(__dirname, '..', 'sbom.json');
fs.writeFileSync(outPath, JSON.stringify(sbom, null, 2), 'utf8');
console.log(`SBOM written to ${outPath} (${deps.length + 1} packages)`);
