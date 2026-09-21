import 'package:dashboard/auth_service.dart';
import 'package:dashboard/login_page.dart';
import 'package:dashboard/dashboard_page.dart';
import 'package:dashboard/strategy_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('Login validates fields before contacting Firebase', (
    tester,
  ) async {
    await tester.pumpWidget(MaterialApp(home: LoginPage(auth: AuthService())));
    expect(find.text('Welcome back.'), findsOneWidget);
    await tester.ensureVisible(find.text('로그인'));
    await tester.tap(find.text('로그인'));
    await tester.pump();
    expect(find.text('올바른 이메일 주소를 입력해주세요.'), findsOneWidget);
    expect(find.text('비밀번호를 입력해주세요.'), findsOneWidget);
  });

  testWidgets('Dashboard contains Strategy and keeps the logout action', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: DashboardPage(auth: AuthService())),
    );
    expect(find.text('FIND.INC'), findsOneWidget);
    expect(find.text('로그아웃'), findsOneWidget);
    expect(find.byType(StrategyPage), findsOneWidget);
  });
}
