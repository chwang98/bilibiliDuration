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

    // ========== 时长过滤功能 ==========

    // 过滤选项：label -> 阈值（秒），0 表示不限制
    const FILTER_OPTIONS = [
        { label: '3分钟', value: 180 },
        { label: '5分钟', value: 300 },
        { label: '10分钟', value: 600 },
        { label: '不限制', value: 0 },
    ];

    let currentFilterThreshold = 300; // 默认 5 分钟

    // 创建过滤栏
    function createFilterBar() {
        if (document.querySelector('.bili-duration-filter-bar')) return;

        const bar = document.createElement('div');
        bar.className = 'bili-duration-filter-bar';
        Object.assign(bar.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 20px',
            fontSize: '14px',
        });

        // 标签
        const label = document.createElement('span');
        label.textContent = '时长过滤：';
        label.style.color = '#666';
        label.style.fontSize = '14px';

        // 下拉框
        const select = document.createElement('select');
        select.className = 'bili-duration-filter-select';
        Object.assign(select.style, {
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #e3e5e7',
            fontSize: '14px',
            color: '#333',
            background: '#fff',
            cursor: 'pointer',
            outline: 'none',
        });

        FILTER_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === currentFilterThreshold) option.selected = true;
            select.appendChild(option);
        });

        // 清除按钮
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清除过滤';
        clearBtn.className = 'bili-duration-filter-clear';
        Object.assign(clearBtn.style, {
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #fb7299',
            fontSize: '14px',
            color: '#fb7299',
            background: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s',
        });
        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.background = '#fb7299';
            clearBtn.style.color = '#fff';
        });
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.background = '#fff';
            clearBtn.style.color = '#fb7299';
        });

        // 选中视频数提示
        const countHint = document.createElement('span');
        countHint.className = 'bili-duration-filter-count';
        countHint.style.color = '#999';
        countHint.style.fontSize = '13px';

        // 事件
        select.addEventListener('change', () => {
            currentFilterThreshold = parseInt(select.value);
            applyFilter();
            updateCountHint(countHint);
        });

        clearBtn.addEventListener('click', () => {
            select.value = '0';
            currentFilterThreshold = 0;
            applyFilter();
            updateCountHint(countHint);
        });

        bar.appendChild(label);
        bar.appendChild(select);
        bar.appendChild(clearBtn);
        bar.appendChild(countHint);

        // 插入到导航标签下方
        const navTabs = document.querySelector('.nav-tabs');
        const container = document.querySelector('.popular-container');
        if (container) {
            container.insertBefore(bar, container.children[1] || null);
        }
    }

    // 更新计数提示
    function updateCountHint(hintEl) {
        if (!hintEl) {
            hintEl = document.querySelector('.bili-duration-filter-count');
            if (!hintEl) return;
        }
        const totalCards = document.querySelectorAll('.video-card').length;
        const visibleCards = document.querySelectorAll('.video-card[style*="display: none"]');
        if (currentFilterThreshold === 0) {
            hintEl.textContent = `共 ${totalCards} 个视频`;
        } else {
            const hidden = visibleCards.length;
            hintEl.textContent = `共 ${totalCards} 个视频，已过滤 ${hidden} 个`;
        }
    }

    // 获取视频卡片的时长（秒）
    function getCardDuration(card) {
        const link = card.querySelector('a[href*="/video/"]');
        if (!link) return null;
        const href = link.getAttribute('href');
        const bvMatch = href && href.match(/BV\w+/);
        if (!bvMatch) return null;
        return durationMap[bvMatch[0]] != null ? durationMap[bvMatch[0]] : null;
    }

    // 应用过滤：隐藏时长低于阈值的卡片
    function applyFilter() {
        document.querySelectorAll('.video-card').forEach(card => {
            if (currentFilterThreshold === 0) {
                card.style.display = '';
                return;
            }
            const duration = getCardDuration(card);
            // 没有时长数据时不隐藏（可能是新加载的卡片）
            if (duration == null) {
                card.style.display = '';
                return;
            }
            card.style.display = duration >= currentFilterThreshold ? '' : 'none';
        });
        // 更新计数
        const hintEl = document.querySelector('.bili-duration-filter-count');
        if (hintEl) updateCountHint(hintEl);
    }

    // ========== 时长标签显示 ==========

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

    // 为所有已存在的视频卡片添加时长标签（不触发过滤，避免 Observer 死循环）
    function addDurationLabels() {
        document.querySelectorAll('.video-card').forEach(card => {
            // 只处理还没有时长标签的卡片
            if (!card.querySelector('.video-card__content .bili-duration-overlay')) {
                addDurationToCard(card);
            }
        });
    }

    // 添加时长标签并应用过滤
    function addDurationToAllCards() {
        addDurationLabels();
        applyFilter();
    }

    // 监听 DOM 变化，为新添加的视频卡片添加时长
    // 注意：只监听子节点新增，不响应属性变化（style.display 变更不会触发）
    const observer = new MutationObserver((mutations) => {
        let hasNewNodes = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                hasNewNodes = true;
                break;
            }
        }
        if (hasNewNodes) {
            addDurationLabels();
        }
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
        createFilterBar();
        setTimeout(addDurationToAllCards, 100);
        updateCountHint();

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
        updateCountHint();
    }, 3000);

})();