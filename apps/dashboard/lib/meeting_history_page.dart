import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:material_ui/material_ui.dart';

class MeetingHistoryPage extends StatefulWidget {
  const MeetingHistoryPage({super.key, required this.uid});

  final String uid;

  @override
  State<MeetingHistoryPage> createState() => _MeetingHistoryPageState();
}

class _MeetingHistoryPageState extends State<MeetingHistoryPage> {
  static const _pageSize = 25;
  final _meetings = <QueryDocumentSnapshot<Map<String, dynamic>>>[];
  bool _loading = true;
  bool _failed = false;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch({bool refresh = false}) async {
    try {
      var query = FirebaseFirestore.instance
          .collection('meetings')
          .where('uid', isEqualTo: widget.uid)
          .orderBy('endedAt', descending: true)
          .limit(_pageSize);
      if (!refresh && _meetings.isNotEmpty) {
        query = query.startAfterDocument(_meetings.last);
      }
      final result = await query.get(const GetOptions(source: Source.server));
      if (!mounted) return;
      setState(() {
        if (refresh) _meetings.clear();
        _meetings.addAll(result.docs);
        _hasMore = result.size == _pageSize;
        _loading = false;
        _failed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  void _load({bool refresh = false}) {
    setState(() {
      _loading = true;
      _failed = false;
    });
    _fetch(refresh: refresh);
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Row(
        children: [
          Expanded(
            child: Text(
              '내 회의 기록',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          IconButton(
            tooltip: '회의 기록 새로고침',
            onPressed: _loading ? null : () => _load(refresh: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      for (final record in _meetings)
        _MeetingTile(key: ValueKey(record.id), data: record.data()),
      if (_loading)
        const Center(child: CircularProgressIndicator())
      else if (_failed)
        TextButton(
          onPressed: () => _load(refresh: true),
          child: const Text('회의 기록을 불러오지 못했습니다. 다시 시도'),
        )
      else if (_meetings.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: Text('저장된 회의가 없습니다.')),
        )
      else if (_hasMore)
        TextButton(onPressed: _load, child: const Text('더 보기')),
    ],
  );
}

class _MeetingTile extends StatelessWidget {
  const _MeetingTile({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final ended = (data['endedAt'] as Timestamp).toDate().toUtc().add(
      const Duration(hours: 9),
    );
    final date = MaterialLocalizations.of(context).formatShortDate(ended);
    final time = MaterialLocalizations.of(context)
        .formatTimeOfDay(TimeOfDay.fromDateTime(ended));
    final departments = (data['departments'] as List).join(' · ');
    return ExpansionTile(
      title: Text(data['topic'] as String),
      subtitle: Text('$date $time (KST)\n$departments'),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      expandedAlignment: Alignment.centerLeft,
      children: [SelectableText(data['summary'] as String)],
    );
  }
}
