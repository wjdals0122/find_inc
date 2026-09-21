import 'package:material_ui/material_ui.dart';

import 'auth_service.dart';
import 'studio_brand.dart';
import 'strategy_page.dart';
import 'contents_page.dart';
import 'operation_page.dart';
import 'happier/skills_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.auth});
  final AuthService auth;
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool _busy = false;
  int _menu = 0;
  bool _visitedContents = false;
  bool _visitedOperation = false;
  void _openSkills() {
    final owner = widget.auth.currentUser?.uid;
    if (owner == null) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => SkillsPage(owner: owner)));
  }

  Future<void> _logout() async {
    setState(() => _busy = true);
    try {
      await widget.auth.signOut();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('로그아웃하지 못했습니다. 다시 시도해주세요.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      backgroundColor: const Color(0xfff9fafb),
      surfaceTintColor: Colors.transparent,
      automaticallyImplyLeading: false,
      toolbarHeight: 76,
      title: const StudioBrand(),
      actions: [
        if (MediaQuery.sizeOf(context).width >= 360 &&
            MediaQuery.textScalerOf(context).scale(16) <= 21)
          TextButton.icon(
            onPressed: _busy ? null : _openSkills,
            icon: const Icon(Icons.bolt_outlined, size: 22),
            label: const Text('스킬 실행'),
          )
        else
          IconButton(
            tooltip: '스킬 실행',
            onPressed: _busy ? null : _openSkills,
            icon: const Icon(Icons.bolt_outlined, size: 24),
          ),
        if (MediaQuery.sizeOf(context).width < 480 ||
            MediaQuery.textScalerOf(context).scale(16) > 21)
          IconButton(
            tooltip: _busy ? '로그아웃 중…' : '로그아웃',
            onPressed: _busy ? null : _logout,
            icon: const Icon(Icons.logout, size: 20),
          )
        else
          TextButton.icon(
            onPressed: _busy ? null : _logout,
            icon: const Icon(Icons.logout, size: 18),
            label: Text(_busy ? '로그아웃 중…' : '로그아웃'),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xff101828),
            ),
          ),
        const SizedBox(width: 12),
      ],
    ),
    body: IndexedStack(
      index: _menu,
      children: [
        const StrategyPage(),
        if (_visitedContents)
          ContentsPage(active: _menu == 1)
        else
          const SizedBox.shrink(),
        if (_visitedOperation)
          const OperationPage()
        else
          const SizedBox.shrink(),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: _menu,
      backgroundColor: Colors.white,
      indicatorColor: const Color(0xffeef2f6),
      onDestinationSelected: (index) {
        FocusScope.of(context).unfocus();
        setState(() {
          _menu = index;
          if (index == 1) _visitedContents = true;
          if (index == 2) _visitedOperation = true;
        });
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard),
          label: 'Strategy',
        ),
        NavigationDestination(
          icon: Icon(Icons.folder_outlined),
          selectedIcon: Icon(Icons.folder),
          label: 'Contents',
        ),
        NavigationDestination(
          icon: Icon(Icons.bar_chart_outlined),
          selectedIcon: Icon(Icons.bar_chart),
          label: 'Operation',
        ),
      ],
    ),
  );
}
