// ==UserScript==
// @name         B站热门视频时长显示
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在B站热门视频封面上显示视频时长（从接口获取duration参数）
// @author       You
// @match        https://www.bilibili.com/v/popular/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 存储 BV id 到 时长（秒）的映射
    const durationMap = {};

    // 保存原始的 fetch
    const originalFetch = window.fetch;

    // 覆写 fetch 以拦截热门视频 API 响应
    window.fetch = function(...args) {
        const input = args[0];
        const urlStr = typeof input === 'string' ? input : (input && input.url);

        // 拦截热门视频列表接口
        if (urlStr && urlStr.includes('/x/web-interface/popular')) {
            return originalFetch.apply(this, args).then(response => {
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    if (data.code === 0 && data.data && data.data.list) {
                        data.data.list.forEach(item => {
                            if (item.bvid && item.duration != null) {
                                durationMap[item.bvid] = item.duration;
                            }
                        });
                        // 给已存在的视频卡片添加时长
                        setTimeout(addDurationToAllCards, 100);
                    }
                }).catch(() => {});
                return response;
            });
        }
        return originalFetch.apply(this, args);
    };

    // 格式化时长：秒 -> MM:SS 或 HH:MM:SS
    function formatDuration(seconds) {
        seconds = Math.floor(seconds);
        if (seconds <= 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    // 为单个视频卡片添加时长标签
    function addDurationToCard(card) {
        // 找到视频链接，从中提取 BV 号
        const link = card.querySelector('a[href*="/video/"]');
        if (!link) return;

        const href = link.getAttribute('href');
        const bvMatch = href && href.match(/BV\w+/);
        if (!bvMatch) return;

        const bvid = bvMatch[0];
        const duration = durationMap[bvid];
        if (duration == null) return;

        const content = card.querySelector('.video-card__content');
        if (!content) return;

        // 避免重复添加
        if (content.querySelector('.bili-duration-overlay')) return;

        // 创建时长标签
        const durationEl = document.createElement('span');
        durationEl.className = 'bili-duration-overlay';
        durationEl.textContent = formatDuration(duration);
        Object.assign(durationEl.style, {
            position: 'absolute',
            right: '4px',
            bottom: '4px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            fontSize: '12px',
            lineHeight: '1.5',
            padding: '1px 5px',
            borderRadius: '3px',
            zIndex: '10',
            pointerEvents: 'none',
            fontFamily: 'Arial, sans-serif',
        });

        // 确保容器是相对定位
        if (getComputedStyle(content).position === 'static') {
            content.style.position = 'relative';
        }

        content.appendChild(durationEl);
    }

    // 为所有已存在的视频卡片添加时长
    function addDurationToAllCards() {
        document.querySelectorAll('.video-card').forEach(addDurationToCard);
    }

    // 监听 DOM 变化，为新添加的视频卡片添加时长
    const observer = new MutationObserver(() => {
        addDurationToAllCards();
    });

    // 从 Vuex store 中提取时长数据（备用方案，防止 fetch 拦截器漏掉）
    function tryExtractFromStore() {
        try {
            const appEl = document.querySelector('#app');
            if (!appEl) return;
            const store = appEl.__vue__ && appEl.__vue__.$store;
            if (!store) return;
            const state = store.state;
            if (!state || !state.flow) return;

            // 遍历所有页面（page）的缓存数据
            Object.keys(state.flow).forEach(key => {
                if (key.startsWith('getPopularList-')) {
                    const entry = state.flow[key];
                    if (entry && entry.result && Array.isArray(entry.result)) {
                        entry.result.forEach(item => {
                            if (item.bvid && item.duration != null) {
                                durationMap[item.bvid] = item.duration;
                            }
                        });
                    }
                }
            });
        } catch (e) {
            // 静默失败
        }
    }

    // 页面加载完成后启动监听
    const startObserver = () => {
        tryExtractFromStore();
        setTimeout(addDurationToAllCards, 100);

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }

    // 页面完全加载后再次尝试
    window.addEventListener('load', () => {
        tryExtractFromStore();
        setTimeout(addDurationToAllCards, 500);
    });

    // 定期检查是否有新卡片需要添加时长（兜底方案）
    setInterval(() => {
        tryExtractFromStore();
        addDurationToAllCards();
    }, 3000);

})();