# 베이스 이미지를 Node.js로 설정 (최신 LTS 버전 사용)
FROM node:22-alpine

# 컨테이너 안의 작업 디렉토리 설정
WORKDIR /usr/src/app

# package.json과 package-lock.json을 컨테이너로 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 프로젝트 파일들을 컨테이너로 복사
COPY . .

# 컨테이너가 3001번 포트를 사용하도록 설정
EXPOSE 3001

# 애플리케이션 실행 명령어
CMD ["node", "index.js"]