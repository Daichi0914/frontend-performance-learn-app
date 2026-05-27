# frontend-performance-learn-app

本プロジェクトは、Go (Clean Architecture) と Next.js (App Router) をベースにした Web アプリケーション開発用のプロジェクトです。

テンプレートからプロジェクトを作成したのち、以下の手順に従って環境を立ち上げてください。

## ローカル環境のセットアップと起動

1. **環境変数のコピー:**
   ```bash
   cp .env.example .env
   cp .env.e2e.example .env.e2e
   ```

2. **フロントエンド依存パッケージのインストール:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. **コンテナ環境の起動:**
   Make コマンドを利用して、MySQL、Redis、Nginx、Backend、Frontend を一括で起動します。
   ```bash
   make up
   ```

### 3. 起動の確認
コンテナ起動後、ブラウザで以下のアドレスにアクセスして接続ステータス（API、DB、Redis）を確認できます。
- **ダッシュボード:** [http://localhost:8080](http://localhost:8080)
- **Frontend 開発サーバー:** [http://localhost:3000](http://localhost:3000)

---

## デプロイ（Staging / Production）について

本プロジェクトには自動デプロイ用のワークフロー（`.github/workflows/deploy.yml`）が用意されています。デプロイ環境を構築する際は、GitHub Actions の Environment に必要な環境変数およびシークレットを設定してください。

必要な設定項目については、`.env.example`の末尾にある `GitHub Actions / CD (Deploy) Settings` セクションを参照してください。
