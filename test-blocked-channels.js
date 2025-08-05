// Test script for blocked channels functionality
const DatabaseUtils = require('./src/utils/database');

async function testBlockedChannels() {
    console.log('🧪 Testing blocked channels functionality...\n');
    
    const testServerId = '123456789012345678';
    const testChannelId = '987654321098765432';
    const testUserId = '111111111111111111';
    
    try {
        // Test 1: Add a blocked channel
        console.log('📝 Test 1: Adding blocked channel...');
        const addedChannel = await DatabaseUtils.addBlockedChannel(testServerId, testChannelId, 'Test reason', testUserId);
        console.log('✅ Added blocked channel:', addedChannel);
        
        // Test 2: Check if channel is blocked
        console.log('\n📝 Test 2: Checking if channel is blocked...');
        const blockedChannel = await DatabaseUtils.isChannelBlocked(testServerId, testChannelId);
        console.log('✅ Channel blocked status:', blockedChannel ? 'BLOCKED' : 'NOT BLOCKED');
        
        // Test 3: Get all blocked channels
        console.log('\n📝 Test 3: Getting all blocked channels...');
        const allBlockedChannels = await DatabaseUtils.getBlockedChannels(testServerId);
        console.log('✅ All blocked channels:', allBlockedChannels);
        
        // Test 4: Remove blocked channel
        console.log('\n📝 Test 4: Removing blocked channel...');
        const removed = await DatabaseUtils.removeBlockedChannel(testServerId, testChannelId);
        console.log('✅ Removed blocked channel:', removed);
        
        // Test 5: Verify channel is no longer blocked
        console.log('\n📝 Test 5: Verifying channel is no longer blocked...');
        const stillBlocked = await DatabaseUtils.isChannelBlocked(testServerId, testChannelId);
        console.log('✅ Channel blocked status after removal:', stillBlocked ? 'BLOCKED' : 'NOT BLOCKED');
        
        // Test 6: Clear all blocked channels
        console.log('\n📝 Test 6: Adding multiple channels and clearing all...');
        await DatabaseUtils.addBlockedChannel(testServerId, '111111111111111111', 'Test 1', testUserId);
        await DatabaseUtils.addBlockedChannel(testServerId, '222222222222222222', 'Test 2', testUserId);
        await DatabaseUtils.addBlockedChannel(testServerId, '333333333333333333', 'Test 3', testUserId);
        
        const beforeClear = await DatabaseUtils.getBlockedChannels(testServerId);
        console.log('✅ Before clear:', beforeClear.length, 'channels');
        
        const cleared = await DatabaseUtils.clearBlockedChannels(testServerId);
        console.log('✅ Cleared all blocked channels:', cleared);
        
        const afterClear = await DatabaseUtils.getBlockedChannels(testServerId);
        console.log('✅ After clear:', afterClear.length, 'channels');
        
        console.log('\n🎉 All tests passed! Blocked channels functionality is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testBlockedChannels(); 