FROM mysql:8.0

# 初期化スクリプトをイメージ内にコピー
# このディレクトリに置かれたスクリプトは、DBの初期化時に自動実行されます
COPY init/01_grant_privileges.sh /docker-entrypoint-initdb.d/
