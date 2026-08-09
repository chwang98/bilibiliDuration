// ==UserScript==
// @name         B站热门视频时长显示
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在B站热门视频封面上显示视频时长
// @author       You
// @match        https://www.bilibili.com/v/popular/*
// @run-at       document-start
// @grant        none
// @license MIT
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

        // 拦截热门视频列表接口（综合热门 + 排行榜）
        const isPopular = urlStr && urlStr.includes('/x/web-interface/popular');
        const isRanking = urlStr && urlStr.includes('/x/web-interface/ranking/v2');
        if (isPopular || isRanking) {
            return originalFetch.apply(this, args).then(response => {
                const clonedResponse = response.clone();
                clonedResponse.json().then(data => {
                    const list = isPopular
                        ? (data.data && data.data.list)
                        : (data.data && data.data.list);
                    if (data.code === 0 && Array.isArray(list)) {
                        list.forEach(item => {
                            if (item.bvid && item.duration != null) {
                                durationMap[item.bvid] = item.duration;
                            }
                        });
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

    let currentFilterThreshold = 0; // 默认不过滤

    // 创建过滤栏（带重试，确保容器出现后再插入）
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
            flexWrap: 'wrap',
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

        // 尝试插入到页面中：先查找 .popular-container，找不到则插入到 .video-card 列表前
        const tryInsert = () => {
            const container = document.querySelector('.popular-container');
            if (container) {
                // 插入到容器最前面
                container.insertBefore(bar, container.firstChild);
                return true;
            }
            // 如果容器还没出现，等50ms重试，最多重试20次
            return false;
        };

        if (!tryInsert()) {
            let retries = 0;
            const interval = setInterval(() => {
                retries++;
                if (tryInsert() || retries > 20) {
                    clearInterval(interval);
                }
            }, 50);
        }
    }

    // 更新计数提示
    function updateCountHint(hintEl) {
        if (!hintEl) {
            hintEl = document.querySelector('.bili-duration-filter-count');
            if (!hintEl) return;
        }
        const totalCards = getAllCards().length;
        const hiddenCards = getAllCards().filter(c => c.style.display === 'none');
        if (currentFilterThreshold === 0) {
            hintEl.textContent = `共 ${totalCards} 个视频`;
        } else {
            const hidden = hiddenCards.length;
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
        getAllCards().forEach(card => {
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

    // 获取视频卡片的封面容器（两种页面结构不同）
    function getCoverContainer(card) {
        if (card.classList.contains('video-card')) {
            return card.querySelector('.video-card__content');
        }
        if (card.classList.contains('rank-item')) {
            return card.querySelector('.img');
        }
        return null;
    }

    // 获取所有视频卡片（兼容综合热门和排行榜页面）
    function getAllCards() {
        return document.querySelectorAll('.video-card, .rank-item');
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

        const content = getCoverContainer(card);
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
        getAllCards().forEach(card => {
            // 只处理还没有时长标签的卡片
            const container = getCoverContainer(card);
            if (container && !container.querySelector('.bili-duration-overlay')) {
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
            if (!state) return;

            // 综合热门页面：遍历 flow 中的缓存数据
            if (state.flow) {
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
            }

            // 排行榜页面：直接从 rankList 获取
            if (Array.isArray(state.rankList)) {
                state.rankList.forEach(item => {
                    if (item.bvid && item.duration != null) {
                        durationMap[item.bvid] = item.duration;
                    }
                });
            }
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