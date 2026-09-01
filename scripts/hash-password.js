/**
 * ================================================================
 * 设备运行监控系统 - 本地密码哈希生成脚本
 * 功能：生成 PBKDF2 密码哈希，用于 D1 初始化
 * 使用方式：node scripts/hash-password.js
 * ================================================================
 */

import { generatePasswordHash } from '../functions/utils/password.js';
import readline from 'readline';

// ================================================================
// 命令行交互
// ================================================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// ================================================================
// 主函数
// ================================================================

async function main() {
    console.log('');
    console.log('========================================');
    console.log('  设备运行监控系统 - 密码哈希生成器');
    console.log('  用于生成管理员初始账号的密码哈希');
    console.log('========================================');
    console.log('');

    const password = await question('请输入密码: ');

    if (!password || password.trim() === '') {
        console.log('❌ 密码不能为空');
        rl.close();
        return;
    }

    if (password.length < 4) {
        console.log('❌ 密码长度至少 4 位');
        rl.close();
        return;
    }

    console.log('');
    console.log('⏳ 正在生成哈希...');

    try {
        const { hash, salt } = await generatePasswordHash(password);

        console.log('');
        console.log('========================================');
        console.log('✅ 生成成功！');
        console.log('');
        console.log('  密码哈希 (password_hash):');
        console.log(`  ${hash}`);
        console.log('');
        console.log('  盐值 (password_salt):');
        console.log(`  ${salt}`);
        console.log('');
        console.log('========================================');
        console.log('');
        console.log('📌 在 D1 Console 中执行以下 SQL:');
        console.log('');
        console.log(`INSERT INTO users (id, username, nickname, password_hash, password_salt, role, created_by)`);
        console.log(`VALUES (`);
        console.log(`  'admin_${Date.now()}',`);
        console.log(`  'admin',`);
        console.log(`  '管理员',`);
        console.log(`  '${hash}',`);
        console.log(`  '${salt}',`);
        console.log(`  'admin',`);
        console.log(`  'admin'`);
        console.log(`);`);
        console.log('');
        console.log('⚠️  请将以上 SQL 中的 password_hash 和 password_salt 替换为上面生成的值');
        console.log('⚠️  请妥善保管密码，系统不支持密码找回功能');
        console.log('========================================');
        console.log('');
    } catch (error) {
        console.error('❌ 生成失败:', error.message);
    }

    rl.close();
}

// ================================================================
// 执行
// ================================================================

main();
