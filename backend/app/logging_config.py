"""アプリ専用ロガーの設定。

uvicorn のログ設定に左右されないよう、独自ハンドラを付けて propagate=False にする。
これでサーバーの起動方法に関わらず、いつも同じ形式でログが出る。
"""
import logging
import sys

from .config import settings


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("warikan")
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-7s | warikan | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)
        logger.propagate = False  # 二重出力を防ぐ

    return logger


# import 時に一度だけ設定し、各モジュールから使い回す
logger = setup_logging()
