#!/usr/bin/env node
/**
 * 版本号自动升级脚本
 * 基于 Git 提交次数自动生成版本号，格式：0.提交次数.0
 * 并同步更新 package.json、Cargo.toml、tauri.conf.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * 获取 Git 提交次数
 */
function getGitCommitCount() {
  try {
    const count = execSync('git rev-list --count HEAD', { 
      encoding: 'utf-8',
      cwd: rootDir 
    }).trim();
    return parseInt(count, 10);
  } catch (error) {
    console.warn('无法获取 Git 提交次数，使用默认值 1');
    return 1;
  }
}

/**
 * 生成版本号
 * 格式：0.提交次数.0
 */
function generateVersion(commitCount) {
  return `0.${commitCount}.0`;
}

/**
 * 更新 package.json
 */
function updatePackageJson(newVersion) {
  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const oldVersion = packageJson.version;
  
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
  
  console.log(`✓ package.json: ${oldVersion} -> ${newVersion}`);
}

/**
 * 更新 Cargo.toml
 */
function updateCargoToml(newVersion) {
  const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');
  let cargoToml = readFileSync(cargoTomlPath, 'utf-8');
  const oldVersion = cargoToml.match(/version\s*=\s*"([^"]+)"/)?.[1] || 'unknown';
  
  cargoToml = cargoToml.replace(/version\s*=\s*"([^"]+)"/, `version = "${newVersion}"`);
  writeFileSync(cargoTomlPath, cargoToml, 'utf-8');
  
  console.log(`✓ Cargo.toml: ${oldVersion} -> ${newVersion}`);
}

/**
 * 更新 tauri.conf.json
 */
function updateTauriConf(newVersion) {
  const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
  const oldVersion = tauriConf.version;
  
  tauriConf.version = newVersion;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8');
  
  console.log(`✓ tauri.conf.json: ${oldVersion} -> ${newVersion}`);
}

/**
 * 主函数
 */
function main() {
  console.log('📦 开始自动升级版本号...\n');
  
  const commitCount = getGitCommitCount();
  const newVersion = generateVersion(commitCount);
  
  console.log(`🔍 Git 提交次数: ${commitCount}`);
  console.log(`📌 生成版本号: ${newVersion}\n`);
  
  updatePackageJson(newVersion);
  updateCargoToml(newVersion);
  updateTauriConf(newVersion);
  
  console.log('\n✅ 版本号升级完成！');
}

// 执行主函数
main();
