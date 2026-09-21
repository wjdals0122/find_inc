import 'package:material_ui/material_ui.dart';

class StudioBrand extends StatelessWidget {
  const StudioBrand({super.key});
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Transform.rotate(
        angle: -.175,
        child: SizedBox(
          width: 17,
          height: 17,
          child: Wrap(
            spacing: 3,
            runSpacing: 3,
            children: List.generate(
              4,
              (i) => Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: i == 3
                      ? const Color(0xff4b83f3)
                      : const Color(0xff101828),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(width: 12),
      const Text(
        'FIND.INC',
        style: TextStyle(
          color: Color(0xff101828),
          fontSize: 16,
          fontWeight: FontWeight.w700,
          letterSpacing: .3,
        ),
      ),
    ],
  );
}
