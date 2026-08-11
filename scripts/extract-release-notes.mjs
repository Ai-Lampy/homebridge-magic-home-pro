/* global process */
import fs from 'node:fs';

const version = process.argv[2];
if (!version) throw new Error('Usage: node scripts/extract-release-notes.mjs <version>');

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^##\\s+v?${escapedVersion}\\s*$`, 'm');
const match = heading.exec(changelog);
if (!match) throw new Error(`CHANGELOG.md has no section for version ${version}`);

const remainder = changelog.slice(match.index + match[0].length).replace(/^\r?\n/, '');
const nextHeading = remainder.search(/^##\s+/m);
const notes = (nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder).trim();
if (!notes) throw new Error(`CHANGELOG.md section ${version} has no release notes`);

process.stdout.write(`${notes}\n`);
