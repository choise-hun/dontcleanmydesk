// 네이티브 플랫폼에서는 WP-1 웹 전용 미리보기 대신 홈으로 복귀한다 (D1).
import { Redirect } from 'expo-router';

export default function CollagePreviewNativeRedirect() {
  return <Redirect href="/" />;
}
