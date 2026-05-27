FROM nginx:alpine

# テンプレートとしてコピー（起動時に環境変数が展開され conf.d/ に配置される）
COPY default.conf /etc/nginx/templates/default.conf.template

# prod環境等でBasic認証をOFFにした際、ファイルが存在しないエラーを防ぐための空ファイル
RUN touch /etc/nginx/.htpasswd
