"""Check a 163 SMTP authorization code without sending mail or saving secrets."""

from getpass import getpass
from smtplib import SMTPAuthenticationError, SMTPException, SMTP_SSL
import socket
import sys


def main() -> int:
    address = input("Supabase 中的发件邮箱 / SMTP Username: ").strip()
    if not address.endswith("@163.com") or address.count("@") != 1:
        print("请输入完整的 @163.com 发件邮箱地址。")
        return 2

    code = getpass("163 客户端授权码（输入不显示）: ").strip()
    if not code:
        print("授权码不能为空。")
        return 2

    try:
        with SMTP_SSL("smtp.163.com", 465, timeout=15) as smtp:
            smtp.login(address, code)
    except SMTPAuthenticationError as error:
        print(f"SMTP 登录被 163 拒绝（状态码 {error.smtp_code}）。请核对授权码所属邮箱、是否已启用 SMTP，以及复制时有无空格。")
        return 1
    except (OSError, socket.timeout, SMTPException) as error:
        print(f"SMTP 连接或协议失败：{type(error).__name__}。")
        return 1
    finally:
        code = ""

    print("SMTP 登录成功（未发送邮件）。如果 Supabase 注册仍报 535，请重新检查其保存的授权码。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
