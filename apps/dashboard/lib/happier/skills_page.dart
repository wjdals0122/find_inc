import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'happier_client.dart';
import 'happier_models.dart';
import 'happier_vault.dart';

class SkillsPage extends StatefulWidget {
  const SkillsPage({super.key, required this.owner});
  final String owner;
  @override
  State<SkillsPage> createState() => _SkillsPageState();
}

class _SkillsPageState extends State<SkillsPage> with WidgetsBindingObserver {
  late final _client = HappierClient(vault: HappierSecureVault(widget.owner));
  final _instruction = TextEditingController();
  final _form = GlobalKey<FormState>();
  StreamSubscription<User?>? _auth;
  Timer? _timer;
  Future<void>? _pollFuture;
  List<Map<String, dynamic>> _skills = [];
  String? _skill, _model, _effort, _error;
  HappierRun? _selectedRun;
  bool _loading = true, _busy = false, _polling = false, _apply = false;
  bool _foreground = true;
  static const _ink = Color(0xff101828),
      _muted = Color(0xff667085),
      _line = Color(0xffe4e7ec);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _auth = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user?.uid != widget.owner) {
        _client.close();
        if (mounted) Navigator.of(context).pop();
      }
    });
    unawaited(_initialize());
    _timer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => unawaited(_poll()),
    );
  }

  Future<void> _initialize() async {
    try {
      final catalog = objectMap(
        jsonDecode(
          await rootBundle.loadString('assets/happier/skills-catalog.json'),
        ),
      );
      _skills = (catalog['skills'] as List).map(objectMap).toList();
      _skill = _skills.firstOrNull?['id'];
      await _client.restore();
      _selectedRun = _client.runs.firstOrNull;
      if (_client.authorized) {
        await _client.discover();
        _syncModel();
      }
    } catch (e) {
      _error = _message(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(Object e) {
    if (e is StateError) return e.message.toString();
    if (e is FormatException) return e.message;
    if (e is TimeoutException) return 'Happier 연결이 늦습니다. PC의 연결 상태를 확인해주세요.';
    return 'Happier에 연결하지 못했습니다. 네트워크와 실행 PC를 확인한 뒤 다시 시도해주세요.';
  }

  void _syncModel() {
    final chosen =
        _client.models.where((m) => m.id == _model).firstOrNull ??
        _client.models.firstOrNull;
    _model = chosen?.id;
    if (chosen != null && !chosen.efforts.contains(_effort)) {
      _effort = chosen.defaultEffort;
    }
    if (chosen == null) _effort = null;
  }

  Future<void> _action(Future<void> Function() work) async {
    if (!mounted || _busy || _loading) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _pollFuture;
      if (!mounted || _client.closed) return;
      await work();
    } catch (e) {
      if (mounted) _error = _message(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _connect() => _action(() async {
    final pending = await _client.startPairing();
    if (!await launchUrl(pending.url, mode: LaunchMode.externalApplication)) {
      throw StateError('Happier 승인 화면을 열지 못했습니다. 승인 화면 열기를 다시 눌러주세요.');
    }
  });

  Future<void> _recheck() => _action(() async {
    if (_client.pairing != null && !await _client.checkPairing()) {
      throw StateError(
        '승인을 기다리고 있습니다. Happier에서 Accept Connection을 누른 뒤 돌아와주세요.',
      );
    }
    if (!_client.authorized) return;
    await _client.discover();
    _syncModel();
  });

  Future<void> _poll() {
    if (!mounted ||
        _loading ||
        _busy ||
        _polling ||
        !_foreground ||
        _client.closed) {
      return Future.value();
    }
    final run = _selectedRun;
    if (_client.pairing == null &&
        (!_client.authorized ||
            run == null ||
            run.finished ||
            run.sessionId == null)) {
      return Future.value();
    }
    return _pollFuture = _pollActive();
  }

  Future<void> _pollActive() async {
    _polling = true;
    try {
      if (_client.pairing != null) {
        if (await _client.checkPairing()) {
          await _client.discover();
          _syncModel();
          _error = null;
        }
      } else if (_client.authorized) {
        final run = _selectedRun;
        if (run != null && !run.finished && run.sessionId != null) {
          await _client.refreshRun(run);
        }
      }
    } catch (e) {
      if (mounted) _error = _message(e);
    } finally {
      _polling = false;
      if (mounted) setState(() {});
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground) unawaited(_poll());
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    await _action(() async {
      final spec = _skills.firstWhere((s) => s['id'] == _skill);
      final future = _client.createRun(
        skill: spec['id'],
        label: spec['label'],
        model: _model!,
        effort: _effort!,
        instruction: _instruction.text,
        apply: _apply,
      );
      // The client records the request before issuing RPC. Keep the progress visible.
      if (mounted) setState(() => _selectedRun = _client.runs.firstOrNull);
      final run = await future;
      _selectedRun = run;
    });
  }

  Future<void> _changeTarget() async {
    final result = await showModalBottomSheet<({String machine, String path})>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _TargetSheet(
        machines: _client.machines,
        selected: _client.machine?.id,
        directory: _client.directory,
      ),
    );
    if (result == null || !mounted) return;
    await _action(() async {
      await _client.selectTarget(result.machine, result.path);
      _syncModel();
    });
  }

  Future<void> _openHappier({HappierRun? run}) async {
    final url = Uri.parse(
      run?.sessionId == null
          ? 'https://cloud.happier.dev'
          : 'https://cloud.happier.dev/session/${Uri.encodeComponent(run!.sessionId!)}',
    );
    try {
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
        throw StateError('Happier를 열지 못했습니다.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    unawaited(_auth?.cancel());
    _client.close();
    _instruction.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xfff9fafb),
    appBar: AppBar(
      title: const Text('스킬 실행'),
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      actions: [
        IconButton(
          tooltip: 'Happier 열기',
          onPressed: () => _openHappier(),
          icon: const Icon(Icons.open_in_new, size: 21),
        ),
        const SizedBox(width: 8),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    const Text(
                      'PC의 스킬을 앱에서',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        color: _ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Happier로 연결한 PC에서 작업하고 결과를 확인하세요.',
                      style: TextStyle(color: _muted, height: 1.6),
                    ),
                    const SizedBox(height: 24),
                    _connectionCard(),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Semantics(
                          liveRegion: true,
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xfffff3eb),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(
                                  Icons.info_outline,
                                  size: 20,
                                  color: Color(0xff9a3412),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    _error!,
                                    style: const TextStyle(
                                      color: Color(0xff9a3412),
                                      height: 1.5,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 20),
                    _runForm(),
                    const SizedBox(height: 28),
                    _history(),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
  );

  Widget _card(Widget child) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: _line),
      borderRadius: BorderRadius.circular(16),
    ),
    child: child,
  );

  Widget _connectionCard() => _card(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Icon(
              _client.ready ? Icons.verified_user_outlined : Icons.link,
              size: 21,
              color: _client.ready ? const Color(0xff047857) : _muted,
            ),
            Text(
              _client.ready
                  ? '암호화 연결 확인됨'
                  : _client.authorized
                  ? '실행 PC 확인 필요'
                  : 'Happier 연결',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 17,
                color: _ink,
              ),
            ),
            if (_busy || _polling)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (!_client.authorized) ...[
          const Text(
            '1. 실행 PC와 같은 계정으로 로그인\n2. Accept Connection 누르기\n3. 앱으로 돌아오기',
            style: TextStyle(height: 1.9, color: _ink),
          ),
          const SizedBox(height: 16),
          if (_client.pairing != null) ...[
            const Text(
              '승인을 기다리는 중… 앱으로 돌아오면 자동으로 확인합니다.',
              style: TextStyle(color: _muted, height: 1.5),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: _busy
                      ? null
                      : () => _action(() async {
                          if (!await launchUrl(
                            _client.pairing!.url,
                            mode: LaunchMode.externalApplication,
                          )) {
                            throw StateError('승인 화면을 열지 못했습니다.');
                          }
                        }),
                  child: const Text('승인 화면 열기'),
                ),
                TextButton(
                  onPressed: _busy ? null : _recheck,
                  child: const Text('승인 확인'),
                ),
                TextButton(
                  onPressed: _busy ? null : _connect,
                  child: const Text('다시 연결'),
                ),
              ],
            ),
          ] else
            FilledButton.icon(
              onPressed: _busy ? null : _connect,
              icon: const Icon(Icons.link),
              label: const Text('Happier 연결'),
            ),
        ] else ...[
          if (_client.machine != null) ...[
            Text(
              _client.machine!.host,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            SelectableText(
              _client.directory ?? '',
              style: const TextStyle(color: _muted, height: 1.5),
            ),
            const SizedBox(height: 8),
            Text(
              _client.machine!.directories.isEmpty
                  ? '최근 폴더가 없어 홈 폴더를 선택했습니다. 작업 폴더를 확인해주세요.'
                  : '최근 사용한 PC와 폴더를 선택했습니다. 언제든 변경할 수 있어요.',
              style: const TextStyle(fontSize: 12, color: _muted, height: 1.5),
            ),
          ] else
            const Text(
              '실행 PC를 찾고 연결 상태를 확인해주세요.',
              style: TextStyle(color: _muted),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            children: [
              OutlinedButton.icon(
                onPressed: _busy ? null : _recheck,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('연결 확인'),
              ),
              if (_client.machines.isNotEmpty)
                TextButton(
                  onPressed: _busy ? null : _changeTarget,
                  child: const Text('PC·폴더 변경'),
                ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => _action(() async {
                        await _client.disconnect();
                        _selectedRun = null;
                        _syncModel();
                      }),
                child: const Text('연결 해제'),
              ),
            ],
          ),
        ],
      ],
    ),
  );

  Widget _runForm() {
    final model = _client.models.where((m) => m.id == _model).firstOrNull;
    final disabled = _busy || !_client.ready;
    final spec = _skills.where((s) => s['id'] == _skill).firstOrNull;
    return _card(
      Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '새 작업',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 18),
            DropdownButtonFormField<String>(
              initialValue: _skill,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '스킬',
                border: OutlineInputBorder(),
              ),
              items: _skills
                  .map(
                    (s) => DropdownMenuItem<String>(
                      value: s['id'],
                      child: Text(s['label'], overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: _busy ? null : (v) => setState(() => _skill = v),
            ),
            if (spec != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  spec['description'],
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _muted,
                    fontSize: 12,
                    height: 1.5,
                  ),
                ),
              ),
            const SizedBox(height: 18),
            DropdownButtonFormField<String>(
              key: ValueKey('model-$_model-${_client.machine?.id}'),
              initialValue: _model,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '모델',
                hintText: '연결 후 표시됩니다',
                border: OutlineInputBorder(),
              ),
              items: _client.models
                  .map(
                    (m) => DropdownMenuItem(
                      value: m.id,
                      child: Text(m.label, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: disabled
                  ? null
                  : (v) => setState(() {
                      _model = v;
                      _effort = null;
                      _syncModel();
                    }),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              key: ValueKey('effort-$_model-$_effort'),
              initialValue: _effort,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '추론 강도',
                hintText: '연결 후 표시됩니다',
                border: OutlineInputBorder(),
              ),
              items: (model?.efforts ?? <String>[])
                  .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                  .toList(),
              onChanged: disabled ? null : (v) => setState(() => _effort = v),
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _instruction,
              enabled: !_busy,
              minLines: 4,
              maxLines: 8,
              maxLength: 8000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: '요청 내용',
                alignLabelWithHint: true,
                hintText: '어떤 작업을 할까요? 브랜드·상품·기간을 함께 적어주세요.',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? '실행할 작업을 적어주세요.' : null,
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text('결과를 대시보드에 반영', style: TextStyle(fontSize: 14)),
              subtitle: const Text(
                '기존 자료와 디자인을 유지해 갱신합니다.',
                style: TextStyle(fontSize: 12),
              ),
              value: _apply,
              onChanged: _busy
                  ? null
                  : (v) => setState(() => _apply = v ?? false),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: disabled || _model == null || _effort == null
                    ? null
                    : _submit,
                style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
                icon: Icon(
                  _busy ? Icons.hourglass_top : Icons.play_arrow,
                  size: 21,
                ),
                label: Text(_busy ? '연결·실행 확인 중…' : '스킬 실행'),
              ),
            ),
            if (!_client.ready)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text(
                  'Happier 연결 확인 후 실행할 수 있습니다.',
                  style: TextStyle(fontSize: 12, color: _muted),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _history() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        '실행 내역',
        style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      if (_client.runs.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 20),
          child: Text('아직 실행한 작업이 없습니다.', style: TextStyle(color: _muted)),
        ),
      if (_client.runs.isNotEmpty) ...[
        DropdownButtonFormField<String>(
          key: ValueKey('run-${_selectedRun?.id}-${_client.runs.length}'),
          initialValue: _selectedRun?.id,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: '작업 선택',
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(),
          ),
          items: _client.runs
              .map(
                (r) => DropdownMenuItem(
                  value: r.id,
                  child: Text(
                    '${r.label} · ${r.createdAt.toLocal().month}/${r.createdAt.toLocal().day} ${r.createdAt.toLocal().hour.toString().padLeft(2, '0')}:${r.createdAt.toLocal().minute.toString().padLeft(2, '0')}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: _busy
              ? null
              : (id) {
                  setState(
                    () => _selectedRun = _client.runs.firstWhere(
                      (r) => r.id == id,
                    ),
                  );
                  unawaited(_poll());
                },
        ),
        const SizedBox(height: 12),
        if (_selectedRun case final run?)
          _card(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  liveRegion: true,
                  child: Text(
                    run.progress,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      height: 1.5,
                      color: run.state == 'completed'
                          ? const Color(0xff047857)
                          : _ink,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${run.data['host']} · ${run.data['model']} · ${run.data['effort']}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: _muted,
                    height: 1.5,
                  ),
                ),
                Text(
                  run.data['directory'] ?? '',
                  style: const TextStyle(
                    fontSize: 12,
                    color: _muted,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  run.data['instruction'],
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, height: 1.5),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    if (!run.finished)
                      OutlinedButton.icon(
                        onPressed: _busy
                            ? null
                            : () => _action(() async {
                                await _client.refreshRun(run);
                              }),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('기존 세션 확인'),
                      ),
                    TextButton.icon(
                      onPressed: () => _openHappier(run: run),
                      icon: const Icon(Icons.open_in_new, size: 16),
                      label: Text(
                        run.state == 'awaiting_approval'
                            ? 'Happier에서 승인'
                            : 'Happier에서 보기',
                      ),
                    ),
                  ],
                ),
                if (run.result.isNotEmpty) ...[
                  const Divider(height: 28),
                  const Text(
                    '실행 결과',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  SelectableText(
                    run.result,
                    style: const TextStyle(
                      height: 1.65,
                      fontSize: 14,
                      color: _ink,
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(
                          ClipboardData(text: run.result),
                        );
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('결과를 복사했습니다.')),
                          );
                        }
                      },
                      icon: const Icon(Icons.copy, size: 16),
                      label: const Text('복사'),
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    ],
  );
}

class _TargetSheet extends StatefulWidget {
  const _TargetSheet({required this.machines, this.selected, this.directory});
  final List<HappierMachine> machines;
  final String? selected, directory;
  @override
  State<_TargetSheet> createState() => _TargetSheetState();
}

class _TargetSheetState extends State<_TargetSheet> {
  late String? _machine = widget.selected;
  late final _path = TextEditingController(text: widget.directory);
  final _form = GlobalKey<FormState>();
  HappierMachine? get machine =>
      widget.machines.where((m) => m.id == _machine).firstOrNull;
  @override
  void dispose() {
    _path.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      24,
      24,
      24,
      24 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '실행 PC·폴더',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              initialValue: _machine,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '실행 PC',
                border: OutlineInputBorder(),
              ),
              items: widget.machines
                  .map(
                    (m) => DropdownMenuItem(
                      value: m.id,
                      enabled: m.online,
                      child: Text(
                        '${m.host}${m.online ? '' : ' · 오프라인'}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (id) => setState(() {
                _machine = id;
                _path.text =
                    machine?.directories.firstOrNull ?? machine?.home ?? '';
              }),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _path,
              autocorrect: false,
              enableSuggestions: false,
              maxLines: 3,
              minLines: 1,
              decoration: const InputDecoration(
                labelText: 'PC의 작업 폴더',
                hintText: '전체 폴더 경로',
                border: OutlineInputBorder(),
              ),
              validator: (v) => !isAbsoluteRemotePath(v?.trim() ?? '')
                  ? '전체 폴더 경로를 입력해주세요.'
                  : null,
            ),
            if (machine?.directories.isNotEmpty == true) ...[
              const SizedBox(height: 16),
              const Text(
                '최근 사용한 폴더',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              for (final path in machine!.directories.take(6))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.folder_outlined),
                  title: Text(
                    path,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => setState(() => _path.text = path),
                ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () {
                  if (_form.currentState!.validate() &&
                      _machine != null &&
                      machine?.online == true) {
                    Navigator.pop(context, (
                      machine: _machine!,
                      path: _path.text.trim(),
                    ));
                  }
                },
                child: const Text('이 PC와 폴더로 연결'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
