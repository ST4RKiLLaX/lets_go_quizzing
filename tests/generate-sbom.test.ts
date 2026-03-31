import { expect, test } from 'vitest';
import { buildSbom } from '../scripts/generate-sbom.js';

test('buildSbom keeps package identity aligned with nested lockfile nodes', () => {
  const lock = {
    packages: {
      '': {
        name: 'demo-app',
        version: '1.0.0',
        devDependencies: {
          postcss: '^8.5.8',
          '@eslint-community/eslint-utils': '^4.9.1',
        },
      },
      'node_modules/postcss': {
        version: '8.5.8',
        resolved: 'https://registry.npmjs.org/postcss/-/postcss-8.5.8.tgz',
        integrity: 'sha512-postcss',
        dev: true,
        license: 'MIT',
        dependencies: {
          nanoid: '^3.3.11',
        },
      },
      'node_modules/postcss/node_modules/nanoid': {
        version: '3.3.11',
        resolved: 'https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz',
        integrity: 'sha512-nanoid',
        dev: true,
        license: 'MIT',
      },
      'node_modules/@eslint-community/eslint-utils': {
        version: '4.9.1',
        resolved: 'https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.9.1.tgz',
        integrity: 'sha512-eslint-utils',
        dev: true,
        license: 'MIT',
        dependencies: {
          'eslint-visitor-keys': '^3.4.3',
        },
      },
      'node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys': {
        version: '3.4.3',
        resolved: 'https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz',
        integrity: 'sha512-eslint-visitor-keys',
        dev: true,
        license: 'Apache-2.0',
      },
    },
  };
  const pkg = {
    name: 'demo-app',
    version: '1.0.0',
    private: true,
  };

  const sbom = buildSbom(lock, pkg, {
    now: '2026-03-31T00:00:00.000Z',
    namespaceSuffix: 1,
  });

  expect(sbom.packages.find((entry) => entry.SPDXID === 'SPDXRef-Root')).toMatchObject({
    downloadLocation: 'NONE',
    licenseDeclared: 'NOASSERTION',
    licenseConcluded: 'NOASSERTION',
  });

  expect(
    sbom.packages.find((entry) => entry.name === 'nanoid' && entry.versionInfo === '3.3.11')
  ).toMatchObject({
    downloadLocation: 'https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz',
    comment: 'Dev dependency',
  });

  expect(
    sbom.packages.find((entry) => entry.name === 'eslint-visitor-keys' && entry.versionInfo === '3.4.3')
  ).toMatchObject({
    downloadLocation: 'https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz',
    comment: 'Dev dependency',
  });

  expect(sbom.packages.some((entry) => entry.name === 'postcss' && entry.versionInfo === '3.3.11')).toBe(false);
  expect(
    sbom.packages.some(
      (entry) => entry.name === '@eslint-community/eslint-utils' && entry.versionInfo === '3.4.3'
    )
  ).toBe(false);

  expect(
    sbom.relationships.filter((entry) => entry.spdxElementId === 'SPDXRef-Root')
  ).toEqual([
    {
      spdxElementId: 'SPDXRef-Root',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-_eslint-community_eslint-utils-4.9.1',
    },
    {
      spdxElementId: 'SPDXRef-Root',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-postcss-8.5.8',
    },
  ]);

  expect(sbom.relationships).toContainEqual({
    spdxElementId: 'SPDXRef-Package-postcss-8.5.8',
    relationshipType: 'DEPENDS_ON',
    relatedSpdxElement: 'SPDXRef-Package-nanoid-3.3.11',
  });
  expect(sbom.relationships).toContainEqual({
    spdxElementId: 'SPDXRef-Package-_eslint-community_eslint-utils-4.9.1',
    relationshipType: 'DEPENDS_ON',
    relatedSpdxElement: 'SPDXRef-Package-eslint-visitor-keys-3.4.3',
  });
});

test('buildSbom resolves dependencies by installed path before emitting deduped relationships', () => {
  const lock = {
    packages: {
      '': {
        name: 'demo-app',
        version: '1.0.0',
        dependencies: {
          a: '^1.0.0',
          c: '^1.0.0',
        },
      },
      'node_modules/a': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
        integrity: 'sha512-a',
        license: 'MIT',
        dependencies: {
          c: '^1.0.0',
        },
      },
      'node_modules/c': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/c/-/c-1.0.0.tgz',
        integrity: 'sha512-c',
        license: 'MIT',
      },
    },
  };
  const pkg = {
    name: 'demo-app',
    version: '1.0.0',
  };

  const sbom = buildSbom(lock, pkg, {
    now: '2026-03-31T00:00:00.000Z',
    namespaceSuffix: 2,
  });

  expect(
    sbom.relationships.filter((entry) => entry.spdxElementId === 'SPDXRef-Root')
  ).toEqual([
    {
      spdxElementId: 'SPDXRef-Root',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-a-1.0.0',
    },
    {
      spdxElementId: 'SPDXRef-Root',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-c-1.0.0',
    },
  ]);

  expect(sbom.relationships).toContainEqual({
    spdxElementId: 'SPDXRef-Package-a-1.0.0',
    relationshipType: 'DEPENDS_ON',
    relatedSpdxElement: 'SPDXRef-Package-c-1.0.0',
  });
});
