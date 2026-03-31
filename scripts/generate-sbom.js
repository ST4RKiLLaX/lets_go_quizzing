#!/usr/bin/env node
/**
 * Generates an SPDX 2.3 Software Bill of Materials (SBOM) from package-lock.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function identityKey(name, version) {
  return `${name}@${version}`;
}

function spdxId(name, version) {
  return `SPDXRef-Package-${name.replace(/[@/]/g, '_')}-${version}`;
}

function parseIntegrity(integrity) {
  if (!integrity || !integrity.includes('-')) {
    return null;
  }

  const [prefix, checksumValue] = integrity.split('-', 2);
  const algorithm =
    prefix === 'sha512' ? 'SHA512' : prefix === 'sha384' ? 'SHA384' : prefix === 'sha256' ? 'SHA256' : null;

  return algorithm && checksumValue ? { algorithm, checksumValue } : null;
}

function deriveNameFromPackagePath(packagePath) {
  const segments = packagePath.split('/').filter(Boolean);
  const lastNodeModulesIndex = segments.lastIndexOf('node_modules');

  if (lastNodeModulesIndex === -1 || lastNodeModulesIndex === segments.length - 1) {
    throw new Error(`Unable to derive package name from lockfile path "${packagePath}"`);
  }

  const nameStart = lastNodeModulesIndex + 1;
  const firstSegment = segments[nameStart];

  if (firstSegment.startsWith('@')) {
    const secondSegment = segments[nameStart + 1];

    if (!secondSegment) {
      throw new Error(`Unable to derive scoped package name from lockfile path "${packagePath}"`);
    }

    return `${firstSegment}/${secondSegment}`;
  }

  return firstSegment;
}

function normalizePackageNode(packagePath, pkgData) {
  if (!packagePath || !pkgData?.version) {
    return null;
  }

  const name = pkgData.name || deriveNameFromPackagePath(packagePath);

  return {
    packagePath,
    name,
    version: pkgData.version,
    resolved: pkgData.resolved || null,
    integrity: pkgData.integrity || null,
    license: pkgData.license || null,
    dev: !!pkgData.dev,
    optional: !!pkgData.optional,
    dependencies: {
      ...(pkgData.dependencies || {}),
      ...(pkgData.optionalDependencies || {}),
    },
    bundledDependencies: new Set(pkgData.bundleDependencies || pkgData.bundledDependencies || []),
  };
}

function parentInstallPath(packagePath) {
  if (!packagePath) {
    return null;
  }

  const segments = packagePath.split('/').filter(Boolean);
  const lastNodeModulesIndex = segments.lastIndexOf('node_modules');

  if (lastNodeModulesIndex <= 0) {
    return '';
  }

  return segments.slice(0, lastNodeModulesIndex).join('/');
}

function resolveInstalledDependency(parentPackagePath, dependencyName, packageNodesByPath) {
  let currentPath = parentPackagePath;

  while (currentPath !== null) {
    const candidate = currentPath ? `${currentPath}/node_modules/${dependencyName}` : `node_modules/${dependencyName}`;

    if (packageNodesByPath.has(candidate)) {
      return candidate;
    }

    currentPath = parentInstallPath(currentPath);
  }

  return null;
}

function mergePackageIdentity(existingNode, nextNode) {
  if (!existingNode) {
    return {
      ...nextNode,
      pathCount: 1,
    };
  }

  if (existingNode.resolved && nextNode.resolved && existingNode.resolved !== nextNode.resolved) {
    throw new Error(
      `Conflicting resolved URLs for ${identityKey(existingNode.name, existingNode.version)}: ` +
        `"${existingNode.resolved}" vs "${nextNode.resolved}"`
    );
  }

  if (existingNode.integrity && nextNode.integrity && existingNode.integrity !== nextNode.integrity) {
    throw new Error(
      `Conflicting integrity hashes for ${identityKey(existingNode.name, existingNode.version)}: ` +
        `"${existingNode.integrity}" vs "${nextNode.integrity}"`
    );
  }

  return {
    ...existingNode,
    resolved: existingNode.resolved || nextNode.resolved,
    integrity: existingNode.integrity || nextNode.integrity,
    license: existingNode.license || nextNode.license,
    dev: existingNode.dev || nextNode.dev,
    optional: existingNode.optional || nextNode.optional,
    pathCount: existingNode.pathCount + 1,
  };
}

function buildPackageNodes(lockPackages) {
  const packageNodesByPath = new Map();
  const packageIdentities = new Map();

  for (const [packagePath, pkgData] of Object.entries(lockPackages || {})) {
    const normalizedNode = normalizePackageNode(packagePath, pkgData);

    if (!normalizedNode) {
      continue;
    }

    packageNodesByPath.set(packagePath, normalizedNode);

    const key = identityKey(normalizedNode.name, normalizedNode.version);
    packageIdentities.set(key, mergePackageIdentity(packageIdentities.get(key), normalizedNode));
  }

  return { packageNodesByPath, packageIdentities };
}

function buildPathGraph(packageNodesByPath) {
  const graph = new Map();

  for (const [packagePath, packageNode] of packageNodesByPath.entries()) {
    const children = new Set();

    for (const dependencyName of Object.keys(packageNode.dependencies)) {
      const childPath = resolveInstalledDependency(packagePath, dependencyName, packageNodesByPath);

      if (!childPath) {
        if (packageNode.bundledDependencies.has(dependencyName) || packageNode.optional) {
          continue;
        }

        throw new Error(
          `Unable to resolve dependency "${dependencyName}" for installed package "${packagePath}"`
        );
      }

      children.add(childPath);
    }

    graph.set(packagePath, children);
  }

  return graph;
}

function buildRootDirectDependencies(rootPackage, packageNodesByPath) {
  const directDependencies = [];
  const scopeMap = new Map();
  const scopes = [
    ['runtime', Object.keys(rootPackage.dependencies || {})],
    ['dev', Object.keys(rootPackage.devDependencies || {})],
    ['optional', Object.keys(rootPackage.optionalDependencies || {})],
  ];

  for (const [scope, dependencyNames] of scopes) {
    for (const dependencyName of dependencyNames) {
      const packagePath = resolveInstalledDependency('', dependencyName, packageNodesByPath);

      if (!packagePath) {
        if (scope === 'optional') {
          continue;
        }

        throw new Error(`Unable to resolve root dependency "${dependencyName}"`);
      }

      if (!scopeMap.has(packagePath)) {
        directDependencies.push(packagePath);
        scopeMap.set(packagePath, { runtime: false, dev: false, optional: false });
      }

      scopeMap.get(packagePath)[scope] = true;
    }
  }

  return { directDependencies, directDependencyScopes: scopeMap };
}

function propagateScopes(directDependencyScopes, pathGraph) {
  const pathScopes = new Map();
  const queue = [];

  for (const [packagePath, scopes] of directDependencyScopes.entries()) {
    for (const scope of ['runtime', 'dev', 'optional']) {
      if (scopes[scope]) {
        queue.push({ packagePath, scope });
      }
    }
  }

  while (queue.length > 0) {
    const { packagePath, scope } = queue.shift();
    const existing = pathScopes.get(packagePath) || { runtime: false, dev: false, optional: false };

    if (existing[scope]) {
      continue;
    }

    existing[scope] = true;
    pathScopes.set(packagePath, existing);

    for (const childPath of pathGraph.get(packagePath) || []) {
      queue.push({ packagePath: childPath, scope });
    }
  }

  return pathScopes;
}

function buildIdentityScopes(pathScopes, packageNodesByPath) {
  const identityScopes = new Map();

  for (const [packagePath, scopes] of pathScopes.entries()) {
    const packageNode = packageNodesByPath.get(packagePath);
    const key = identityKey(packageNode.name, packageNode.version);
    const existing = identityScopes.get(key) || { runtime: false, dev: false, optional: false };

    existing.runtime = existing.runtime || scopes.runtime;
    existing.dev = existing.dev || scopes.dev;
    existing.optional = existing.optional || scopes.optional || packageNode.optional;

    identityScopes.set(key, existing);
  }

  return identityScopes;
}

function buildIdentityRelationships(pathGraph, packageNodesByPath) {
  const relationshipKeys = new Set();
  const relationships = [];

  for (const [fromPath, childPaths] of pathGraph.entries()) {
    const fromNode = packageNodesByPath.get(fromPath);
    const fromSpdxId = spdxId(fromNode.name, fromNode.version);

    for (const childPath of childPaths) {
      const childNode = packageNodesByPath.get(childPath);
      const toSpdxId = spdxId(childNode.name, childNode.version);
      const relationshipKey = `${fromSpdxId}->${toSpdxId}`;

      if (relationshipKeys.has(relationshipKey)) {
        continue;
      }

      relationshipKeys.add(relationshipKey);
      relationships.push({
        spdxElementId: fromSpdxId,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: toSpdxId,
      });
    }
  }

  return relationships;
}

function buildDependencyComment(packageNode, scopes) {
  const runtimeReachable = !!scopes?.runtime;
  const devOnly = !!scopes?.dev && !runtimeReachable;
  const optional = !!packageNode.optional || !!scopes?.optional;

  if (optional && devOnly) {
    return 'Optional, Dev dependency';
  }

  if (optional) {
    return 'Optional dependency';
  }

  if (devOnly) {
    return 'Dev dependency';
  }

  return null;
}

function normalizeRepositoryUrl(repository) {
  const rawUrl = typeof repository === 'string' ? repository : repository?.url;

  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(/^git\+/, '').replace(/\.git$/, '');
}

function buildRootPackage(pkg) {
  return {
    SPDXID: 'SPDXRef-Root',
    name: pkg.name,
    versionInfo: pkg.version,
    downloadLocation: pkg.homepage || normalizeRepositoryUrl(pkg.repository) || (pkg.private ? 'NONE' : 'NOASSERTION'),
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: pkg.license || 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    description: pkg.description || 'Quiz application',
  };
}

function validateSbom(sbom) {
  for (const pkg of sbom.packages) {
    if (!pkg.externalRefs) {
      continue;
    }

    const purlRef = pkg.externalRefs.find(
      (ref) => ref.referenceCategory === 'PACKAGE-MANAGER' && ref.referenceType === 'purl'
    );

    if (!purlRef) {
      continue;
    }

    const expectedPurl = `pkg:npm/${encodeURIComponent(pkg.name)}@${pkg.versionInfo}`;

    if (purlRef.referenceLocator !== expectedPurl) {
      throw new Error(`Package ${pkg.name}@${pkg.versionInfo} has mismatched purl "${purlRef.referenceLocator}"`);
    }

    if (pkg.downloadLocation.startsWith('https://registry.npmjs.org/')) {
      const expectedTarball = `${pkg.name.split('/').pop()}-${pkg.versionInfo}.tgz`;

      if (!pkg.downloadLocation.endsWith(`/${expectedTarball}`)) {
        throw new Error(
          `Package ${pkg.name}@${pkg.versionInfo} has mismatched downloadLocation "${pkg.downloadLocation}"`
        );
      }
    }
  }
}

export function buildSbom(lock, pkg, options = {}) {
  const now = options.now || new Date().toISOString();
  const namespaceSuffix = options.namespaceSuffix || Date.now();
  const lockPackages = lock.packages || {};
  const rootPackage = lockPackages[''] || {};
  const { packageNodesByPath, packageIdentities } = buildPackageNodes(lockPackages);
  const pathGraph = buildPathGraph(packageNodesByPath);
  const { directDependencies, directDependencyScopes } = buildRootDirectDependencies(rootPackage, packageNodesByPath);
  const pathScopes = propagateScopes(directDependencyScopes, pathGraph);
  const identityScopes = buildIdentityScopes(pathScopes, packageNodesByPath);
  const dependencyPackages = Array.from(packageIdentities.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
  );
  const directRelationships = directDependencies
    .map((packagePath) => {
      const packageNode = packageNodesByPath.get(packagePath);
      return {
        spdxElementId: 'SPDXRef-Root',
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: spdxId(packageNode.name, packageNode.version),
      };
    })
    .sort((a, b) => a.relatedSpdxElement.localeCompare(b.relatedSpdxElement));
  const transitiveRelationships = buildIdentityRelationships(pathGraph, packageNodesByPath).sort(
    (a, b) =>
      a.spdxElementId.localeCompare(b.spdxElementId) ||
      a.relatedSpdxElement.localeCompare(b.relatedSpdxElement)
  );
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${pkg.name}-${pkg.version}-sbom`,
    documentNamespace: `https://spdx.org/spdxdocs/${pkg.name}-${pkg.version}-${namespaceSuffix}`,
    creationInfo: {
      created: now,
      creators: ['Tool: generate-sbom.js', `Organization: ${pkg.name}`],
    },
    packages: [
      buildRootPackage(pkg),
      ...dependencyPackages.map((packageNode) => {
        const checksum = parseIntegrity(packageNode.integrity);
        const comment = buildDependencyComment(
          packageNode,
          identityScopes.get(identityKey(packageNode.name, packageNode.version))
        );

        return {
          SPDXID: spdxId(packageNode.name, packageNode.version),
          name: packageNode.name,
          versionInfo: packageNode.version,
          downloadLocation: packageNode.resolved || 'NOASSERTION',
          filesAnalyzed: false,
          licenseConcluded: packageNode.license || 'NOASSERTION',
          licenseDeclared: packageNode.license || 'NOASSERTION',
          copyrightText: 'NOASSERTION',
          ...(checksum && { checksums: [checksum] }),
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: `pkg:npm/${encodeURIComponent(packageNode.name)}@${packageNode.version}`,
            },
          ],
          ...(comment && { comment }),
        };
      }),
    ],
    relationships: [...directRelationships, ...transitiveRelationships],
  };

  validateSbom(sbom);

  return sbom;
}

function main() {
  const lockPath = path.join(__dirname, '..', 'package-lock.json');
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const outPath = path.join(__dirname, '..', 'sbom.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const sbom = buildSbom(lock, pkg);

  fs.writeFileSync(outPath, JSON.stringify(sbom, null, 2), 'utf8');
  console.log(`SBOM written to ${outPath} (${sbom.packages.length} packages)`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
