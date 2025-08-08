import requests
import os
import subprocess
from dotenv import load_dotenv
from datetime import datetime


def post_ajaxrefresh():
    url = "https://login.steampowered.com/jwt/ajaxrefresh"
    data = '''------WebKitFormBoundaryFpIXysbQReBvAP3T\nContent-Disposition: form-data; name="redir"\n\nhttps://steamcommunity.com\n------WebKitFormBoundaryFpIXysbQReBvAP3T--'''
    cookies = {
            'steamRefresh_steam':'Find it yourself'
    }
    try:
        response = requests.post(
            url=url,
            headers={
                'Host': 'login.steampowered.com',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryFpIXysbQReBvAP3T',
                'sec-ch-ua-mobile': '?0',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'sec-ch-ua-platform': '"Windows"',
                'Origin': 'https://steamcommunity.com',
                'Sec-Fetch-Site': 'cross-site',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'Referer': 'https://steamcommunity.com/',
                'Accept-Language': 'zh,zh-CN;q=0.9',
                'Content-Length': '199'
            },
            timeout=8,
            cookies=cookies,
            data=data,
            verify=False
        )
        return response.json()
    except Exception as e:
        print(f"steam 刷新cookie在第一步时遇到错误: {e}")
        return {}

def post_settoken(result_json):
    url = "https://steamcommunity.com/login/settoken"
    cookies = {}
    steamID = result_json['steamID']
    nonce = result_json['nonce']
    redir = result_json['redir']
    auth = result_json['auth']
    data = f"""------WebKitFormBoundaryOAaAoQLiUVAH71AI\nContent-Disposition: form-data; name="steamID"\n\n{steamID}\n------WebKitFormBoundaryOAaAoQLiUVAH71AI\nContent-Disposition: form-data; name="nonce"\n\n{nonce}\n------WebKitFormBoundaryOAaAoQLiUVAH71AI\nContent-Disposition: form-data; name="redir"\n\n{redir}\n------WebKitFormBoundaryOAaAoQLiUVAH71AI\nContent-Disposition: form-data; name="auth"\n\n{auth}\n------WebKitFormBoundaryOAaAoQLiUVAH71AI--"""
    try:
        response = requests.post(
            url=url,
            headers={
                "Host": "steamcommunity.com",
                "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundaryOAaAoQLiUVAH71AI",
                "sec-ch-ua-mobile": "?0",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "sec-ch-ua-platform": "\"Windows\"",
                "Origin": "https://steamcommunity.com",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Dest": "empty",
                "Referer": "https://steamcommunity.com",
                "Accept-Language": "zh,zh-CN;q=0.9"
            },
            cookies=cookies,
            data=data,
            verify=False
        )
        set_cookie = response.headers.get('Set-Cookie')
        if set_cookie:
            steamLoginSecure = set_cookie.split('steamLoginSecure=')[1].split('; Expires')[0]
            return steamLoginSecure
        else:
            raise Exception("未获取到steamLoginSecure")
    except Exception as e:
        print(f"在更新steam cookie第二步时遇到错误：{e}")
    return None

def update_env_file(new_steam_login_secure):
    # 加载现有的 .env 文件
    load_dotenv()
    env_path = '.env'
    
    # 读取 .env 文件内容
    with open(env_path, 'r') as file:
        lines = file.readlines()
    
    # 更新 STEAM_LOGIN_SECURE
    with open(env_path, 'w') as file:
        for line in lines:
            if line.startswith('STEAM_LOGIN_SECURE='):
                file.write(f'STEAM_LOGIN_SECURE={new_steam_login_secure}\n')
            else:
                file.write(line)
def restart_nodejs_service():
    try:
        os.system("supervisorctl restart nodejs")
        print(f"[{datetime.now()}] 凭证更新成功，已重启 Node.js 服务")
    except Exception as e:
        print(f"[{datetime.now()}] 操作失败: {str(e)}")

# 使用示例
result = post_ajaxrefresh()
print("ajaxrefresh 返回结果:", result)  # 打印返回的 JSON 数据

if result:
    steamLoginSecure = post_settoken(result)
    if steamLoginSecure:
        print(f"steamLoginSecure: {steamLoginSecure}")
        # 更新 .env 文件中的 STEAM_LOGIN_SECURE
        update_env_file(steamLoginSecure)
        print("已更新 .env 文件中的 STEAM_LOGIN_SECURE")
        
        # 重启 Node.js 服务
        restart_nodejs_service()