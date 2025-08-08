require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts'); // 引入 express-ejs-layouts
const cookieParser = require('cookie-parser'); // 引入 cookie-parser
const bodyParser = require('body-parser'); // 引入 body-parser
const axios = require('axios');
const { parseHTML } = require('linkedom');
const path = require('path');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;
app.use(cookieParser()); // 使用 cookie-parser 中间件

// 配置 body-parser 中间件
app.use(bodyParser.urlencoded({ extended: true })); // 解析 application/x-www-form-urlencoded
app.use(bodyParser.json()); // 解析 application/json

// 设置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 使用 express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'layout'); // 设置默认布局文件为 views/layout.ejs

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 首页路由
app.get('/', (req, res) => {
  res.render('home', { title: 'Wallpaper Search' });
});



// 搜索路由
app.get('/search', async (req, res) => {
  const { searchtext, requiredtags, requiredtype, section, p, browsesort } = req.query;
  const { items, maxPage, error } = await handleSearch(searchtext, requiredtags, requiredtype, section, p, browsesort, req);

  if (error) {
    return res.render('search-results', {
      title: 'Search Results - Wallpaper Search',
      items: [],
      searchtext,
      requiredtags,
      requiredtype,
      section,
      page: p || 1,
      maxPage,
      browsesort,
      error,
    });
  }

  res.render('search-results', {
    title: 'Search Results - Wallpaper Search',
    items,
    searchtext,
    requiredtags,
    requiredtype,
    section,
    page: p || 1,
    maxPage,
    browsesort,
  });
});

function formatDescription(description) {
  // 替换 [h1]...[/h1] 为 <div class="bb_h1">...</div>
  description = description.replace(/\[h1\](.*?)\[\/h1\]/g, '<div class="bb_h1">$1</div>');
  // 替换 [h2]...[/h2] 为 <div class="bb_h2">...</div>
  description = description.replace(/\[h2\](.*?)\[\/h2\]/g, '<div class="bb_h2">$1</div>');
  // 替换 [h3]...[/h3] 为 <div class="bb_h3">...</div>
  description = description.replace(/\[h3\](.*?)\[\/h3\]/g, '<div class="bb_h3">$1</div>');
  // 替换 [b]...[/b] 为 <b>...</b>
  description = description.replace(/\[b\](.*?)\[\/b\]/g, '<b>$1</b>');
  // 替换 [u]...[/u] 为 <u>...</u>
  description = description.replace(/\[u\](.*?)\[\/u\]/g, '<u>$1</u>');
  // 替换 [i]...[/i] 为 <i>...</i>
  description = description.replace(/\[i\](.*?)\[\/i\]/g, '<i>$1</i>');
  // 替换换行符为 <br>
  description = description.replace(/\n/g, '<br>');
  // 替换 [url=...]...[/url] 为 <a href="...">...</a>
  description = description.replace(/\[url=(.*?)\](.*?)\[\/url\]/g, function(match, url, text) {
    // 如果 URL 没有 http:// 或 https:// 前缀，则添加 http://
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    return `<a href="${url}">${text}</a>`;
  });
  // 替换 [img]...[/img] 为 <img src="...">
  description = description.replace(/\[img\](.*?)\[\/img\]/g, '<img src="$1">');
  // 清理 HTML 内容
  return description;
}


// 物品详情路由
app.get('/item/:id', async (req, res) => {
  const item = await handleItemDetail(req.params.id);
  if (item) {
    // 格式化 description
    item.description = formatDescription(item.description);
    res.render('item-detail', { title: item.title + ' - Wallpaper Search', item });
  } else {
    res.status(404).render('404', { title: '404 - Page Not Found' }); // 跳转到404页面
  }
});


// 填写邀请码页面
app.get('/invite-code', (req, res) => {
  const userCode = req.cookies.code; // 获取用户提交的邀请码
  const correctInviteCode = process.env.INVITE_CODE; // 从环境变量中读取正确的邀请码
  res.render('invite-code', { title: 'Invite Code', code: userCode, correctInviteCode });
});

// 提交邀请码
app.post('/submit-invite-code', (req, res) => {
  const inviteCode = req.body.inviteCode; // 获取用户提交的邀请码
  const correctInviteCode = process.env.INVITE_CODE; // 从环境变量中读取正确的邀请码

  if (inviteCode === correctInviteCode) {
    // 如果邀请码正确，将其存储到 Cookie 中
    res.cookie('code', inviteCode, { maxAge: 30 * 24 * 60 * 60 * 1000 }); // 设置 Cookie 有效期为 30 天
    res.redirect('/'); // 重定向到首页
  } else {
    // 如果邀请码错误，重新渲染 invite-code 页面并传递错误信息
    res.render('invite-code', {
      title: 'Invite Code',
      error: 'The invite code is incorrect. Please try again.',
      correctInviteCode,
    });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// 搜索处理函数
async function handleSearch(searchText, requiredTags, requiredType, section, page, browsesort, req) {

  // 检查是否尝试搜索 Mature 内容
  if (requiredTags === 'Mature' && req.cookies.code !== process.env.INVITE_CODE) {
    return { items: [], maxPage: 1, error: 'You have not entered the invite code yet.' };
  }


  let steamUrl = `https://steamcommunity.com/workshop/browse/?appid=431960&searchtext=${encodeURIComponent(searchText)}&section=${section}&p=${page}&browsesort=${browsesort}`;

  if (requiredTags) {
    steamUrl += `&requiredtags%5B%5D=${requiredTags}`;
  }

  if (requiredType) {
    steamUrl += `&requiredtags%5B%5D=${requiredType}`;
  }

  try {
    const response = await axios.get(steamUrl, {
      headers: {
        'Cookie': `sessionid=${process.env.STEAM_SESSIONID}; steamLoginSecure=${process.env.STEAM_LOGIN_SECURE}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }), // 禁用 SSL 验证
    });

    const html = response.data;
    const { items, maxPage } = parseItems(html);
    return { items, maxPage };
  } catch (error) {
    console.error('Error fetching data from Steam:', error);
    return { items: [], maxPage: 1 };
  }
}

// 自定义时间格式化函数
function formatDateTime(timestamp) {
  const date = new Date(timestamp * 1000); // 将秒转换为毫秒
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要加1
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

// 物品详情处理函数
async function handleItemDetail(sharedfileId) {
  const steamApiUrl = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
  const data = new URLSearchParams({
    itemcount: 1,
    'publishedfileids[0]': sharedfileId,
  });

  try {
    const response = await axios.post(steamApiUrl, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }), // 禁用 SSL 验证
    });

    const itemDetails = response.data.response?.publishedfiledetails?.[0];

    // 检查 result 是否为 9
    if (itemDetails && itemDetails.result === 9) {
      return null; // 返回 null，触发 404 页面
    }

    if (itemDetails) {
      // 从 API 返回的数据中提取所需信息
      const creatorId = itemDetails.creator;
      const creatorProfileUrl = `https://steamcommunity.com/profiles/${creatorId}`;

      // 提取 Type 和 Age Rating
      let typeValue = 'Unknown';
      let ageRatingValue = 'Unknown';

      // 遍历 tags 数组，提取 type 和 age rating
      itemDetails.tags.forEach(tag => {
        const tagName = tag.tag.toLowerCase();
        if (['scene', 'video', 'application', 'web'].includes(tagName)) {
          typeValue = tag.tag; // 提取 type
        }
        if (['everyone', 'questionable', 'mature'].includes(tagName)) {
          ageRatingValue = tag.tag; // 提取 age rating
        }
      });

      // 提取统计信息
      const currentSubscribers = itemDetails.subscriptions || 'N/A';
      const currentFavorites = itemDetails.favorited || 'N/A';

      // 获取头像 URL 和昵称
      let avatarUrl = null;
      let avatarFrameUrl = null;
      let creatorName = null;

      try {
        const profileResponse = await axios.get(creatorProfileUrl, {
          headers: {
            'Cookie': `sessionid=${process.env.STEAM_SESSIONID}; steamLoginSecure=${process.env.STEAM_LOGIN_SECURE}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }), // 禁用 SSL 验证
        });

        const profileHtml = profileResponse.data;
        const { document: profileDocument } = parseHTML(profileHtml);

        // 提取昵称
        const nicknameSpan = profileDocument.querySelector('span.actual_persona_name');
        creatorName = nicknameSpan ? nicknameSpan.textContent.trim() : null;

        // 提取头像 URL
        const avatarDiv = profileDocument.querySelector('div.playerAvatarAutoSizeInner');
        if (avatarDiv) {
          const imgTags = avatarDiv.querySelectorAll('img');
          if (imgTags.length === 1) {
            avatarUrl = imgTags[0].src; // 头像 URL
            avatarFrameUrl = null; // 没有头像框
          } else if (imgTags.length >= 2) {
            avatarUrl = imgTags[1].src; // 头像 URL（第二个 img 标签）
            avatarFrameUrl = imgTags[0].src; // 头像框 URL（第一个 img 标签）
          }
        }
      } catch (error) {
        console.error('Error fetching profile page:', error);
      }

      return {
        id: itemDetails.publishedfileid,
        title: itemDetails.title || 'Unknown Title',
        description: itemDetails.description || 'No description available',
        previewImage: itemDetails.preview_url || '',
        fileSize: formatFileSize(itemDetails.file_size || 0),
        timeCreated: formatDateTime(itemDetails.time_created), // 使用自定义格式化函数
        timeUpdated: formatDateTime(itemDetails.time_updated), // 使用自定义格式化函数
        type: typeValue,
        ageRating: ageRatingValue,
        currentSubscribers: currentSubscribers,
        currentFavorites: currentFavorites,
        creatorAvatarUrl: avatarUrl,
        creatorAvatarFrameUrl: avatarFrameUrl, // 新增头像框 URL
        creatorName: creatorName,
        creatorProfileUrl: creatorProfileUrl,
      };
    }
  } catch (error) {
    console.error('Error fetching item details:', error);
  }

  return null; // 如果出现错误或无法解析物品，返回 null
}

// 文件大小格式化函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // 动态调整小数位数
  let size = bytes / Math.pow(k, i);
  let decimals = size < 10 ? 3 : 2; // 小于 10 时保留 3 位小数，否则保留 2 位

  return `${size.toFixed(decimals)} ${units[i]}`;
}


// 解析物品列表
function parseItems(html) {
  const { document } = parseHTML(html);
  const items = [];

  // 解析物品列表
  document.querySelectorAll('.workshopItem').forEach(item => {
    const title = item.querySelector('.workshopItemTitle')?.textContent.trim() || 'Unknown Title';
    const previewImage = item.querySelector('.workshopItemPreviewImage')?.src || '';
    const sharedfileId = item.querySelector('.ugc')?.dataset.publishedfileid || '';
    const authorName = item.querySelector('.workshop_author_link')?.textContent.trim() || 'Unknown Author';

    items.push({ title, previewImage, sharedfileId, authorName });
  });

  // 解析分页控件
  const pagingControls = document.querySelector('.workshopBrowsePagingControls');
  let maxPage = 1;

  if (pagingControls && pagingControls.innerHTML.trim() !== '') {
    // console.log('Paging Controls HTML:', pagingControls.innerHTML); // 输出分页控件的原始 HTML

    const pageBtns = pagingControls.querySelectorAll('.pagebtn');
    let nextPageBtn = null;

    // 找到内容为 ">" 的按钮（可能是 enabled 或 disabled）
    pageBtns.forEach(btn => {
      if (btn.textContent.trim() === '>') {
        nextPageBtn = btn;
      }
    });

    if (nextPageBtn) {
      // console.log('Next Page Button:', nextPageBtn.outerHTML); // 输出 ">" 按钮的原始 HTML

      // 如果 ">" 按钮被禁用，说明当前页是最后一页
      if (nextPageBtn.classList.contains('disabled')) {
        // console.log('Next Page Button is disabled. Current page is the last page.');

        // 找到最后一个数字节点（可能是 <a> 标签或纯文本节点）
        const lastNumberNode = Array.from(pagingControls.childNodes).find(node => {
          return node.nodeType === 3 && /\d+/.test(node.textContent.trim()); // 3 表示文本节点
        });

        if (lastNumberNode) {
          // console.log('Last Number Node:', lastNumberNode.textContent.trim()); // 输出最后一个数字节点的内容
          maxPage = parseInt(lastNumberNode.textContent.trim().replace(/,/g, ''), 10);
        } else {
          // console.log('No last number node found.');
        }
      } else {
        // console.log('Next Page Button is enabled. Current page is not the last page.');

        // 如果 ">" 按钮未被禁用，说明当前页不是最后一页
        // 找到 nextPageBtn 前面的 pagelink
        const prevLink = nextPageBtn.previousElementSibling;
        if (prevLink && prevLink.classList.contains('pagelink')) {
          // console.log('Previous Link:', prevLink.outerHTML); // 输出 prevLink 的原始 HTML
          maxPage = parseInt(prevLink.textContent.trim().replace(/,/g, ''), 10); // 去除逗号并转换为数字
        } else {
          // console.log('No previous link found.');
        }
      }
    } else {
      // console.log('No Next Page Button found.');

      // 如果没有找到 ">" 按钮，可能是最后一页
      const lastNumberNode = Array.from(pagingControls.childNodes).find(node => {
        return node.nodeType === 3 && /\d+/.test(node.textContent.trim()); // 3 表示文本节点
      });

      if (lastNumberNode) {
        // console.log('Last Number Node:', lastNumberNode.textContent.trim()); // 输出最后一个数字节点的内容
        maxPage = parseInt(lastNumberNode.textContent.trim().replace(/,/g, ''), 10);
      } else {
        // console.log('No last number node found.');
      }
    }
  } else {
    // console.log('No paging controls found.');
  }

  // console.log('Parsed maxPage:', maxPage); // 输出解析后的 maxPage
  return { items, maxPage };
}

// 添加404页面路由
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});